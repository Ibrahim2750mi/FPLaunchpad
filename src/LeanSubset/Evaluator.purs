module LeanSubset.Evaluator
  ( Transition
  , Definition
  , reduceOnce
  , isValue
  , renderExpr
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String.Common as String
import Data.Tuple (Tuple(..))
import Control.Lazy (fix)
import LeanSubset.Syntax (Expr(..), Operator(..), SourceSpan, expressionSpan)

type Definition = Tuple String Expr

type Transition =
  { expression :: Expr
  , focus :: SourceSpan
  , activeIndex :: Maybe Int
  , inputItems :: Array Expr
  , outputItems :: Array Expr
  , accumulator :: Maybe Expr
  , note :: String
  }

type Stepper = Array Definition -> Expr -> Either String (Maybe Transition)

reduceOnce :: Array Definition -> Expr -> Either String (Maybe Transition)
reduceOnce = fix stepExpression

stepExpression :: Stepper -> Stepper
stepExpression recurse definitions expression = case expression of
  Natural _ _ -> Right Nothing
  Identifier name location -> case Array.find (\(Tuple key _) -> key == name) definitions of
    Just (Tuple _ value) -> Right (Just (event value location ("Unfold " <> name <> ".")))
    Nothing -> Left ("Unknown identifier '" <> name <> "'.")
  Lambda _ _ _ -> Right Nothing
  ListLiteral items location -> stepList recurse definitions items location
  Let name value body location
    | isValue value ->
        let replacement = substitute name value body
        in Right (Just (event replacement location ("Substitute the value of " <> name <> ".")))
    | otherwise -> do
        next <- recurse definitions value
        case next of
          Nothing -> Left ("The value bound to '" <> name <> "' cannot be evaluated.")
          Just transition -> Right (Just (transition { expression = Let name transition.expression body location }))
  Apply function argument location -> stepApply recurse definitions function argument location
  Binary operator left right location -> stepBinary recurse definitions operator left right location
  MapExpr function values location -> stepMap recurse definitions function values location
  FoldlExpr function initial values location -> stepFoldl recurse definitions function initial values location
  MapWork function pending completed current location -> stepMapWork recurse definitions function pending completed current location
  FoldlWork function accumulator pending current index allItems location ->
    stepFoldlWork recurse definitions function accumulator pending current index allItems location

stepList :: Stepper -> Array Definition -> Array Expr -> SourceSpan -> Either String (Maybe Transition)
stepList recurse definitions items location = stepAt 0 items
  where
  stepAt index remaining = case Array.index remaining index of
    Nothing -> Right Nothing
    Just item
      | isValue item -> stepAt (index + 1) remaining
      | otherwise -> do
          next <- recurse definitions item
          case next of
            Nothing -> Left "A list item cannot be evaluated."
            Just transition -> case Array.updateAt index transition.expression remaining of
              Nothing -> Left "Could not update the list item."
              Just updated -> Right (Just (transition { expression = ListLiteral updated location }))

stepApply :: Stepper -> Array Definition -> Expr -> Expr -> SourceSpan -> Either String (Maybe Transition)
stepApply recurse definitions function argument location = case function of
  Lambda parameter body _
    | isValue argument ->
        let reduced = substitute parameter argument body
        in Right (Just (event reduced location "Apply the function to its argument."))
    | otherwise -> mapChild argument (\next -> Apply function next location)
  _
    | not (isValue function) -> mapChild function (\next -> Apply next argument location)
    | otherwise -> Left "Only functions can be applied to arguments."
  where
  mapChild child rebuild = do
    next <- recurse definitions child
    case next of
      Nothing -> Left "A function application is stuck."
      Just transition -> Right (Just (transition { expression = rebuild transition.expression }))

stepBinary :: Stepper -> Array Definition -> Operator -> Expr -> Expr -> SourceSpan -> Either String (Maybe Transition)
stepBinary recurse definitions operator left right location
  | not (isValue left) = do
      next <- recurse definitions left
      case next of
        Nothing -> Left "The left side of the arithmetic expression is stuck."
        Just transition -> Right (Just (transition { expression = Binary operator transition.expression right location }))
  | not (isValue right) = do
      next <- recurse definitions right
      case next of
        Nothing -> Left "The right side of the arithmetic expression is stuck."
        Just transition -> Right (Just (transition { expression = Binary operator left transition.expression location }))
  | otherwise = case left, right of
      Natural lhs _, Natural rhs _ ->
        let result = case operator of
              Add -> lhs + rhs
              Subtract -> lhs - rhs
              Multiply -> lhs * rhs
        in Right (Just (event (Natural result location) location "Reduce the arithmetic operation."))
      _, _ -> Left "Arithmetic operators in this subset need number operands."

stepMap :: Stepper -> Array Definition -> Expr -> Expr -> SourceSpan -> Either String (Maybe Transition)
stepMap recurse definitions function values location
  | not (isValue function) = stepChild recurse definitions function (\next -> MapExpr next values location) "List.map argument is stuck."
  | not (isValue values) = stepChild recurse definitions values (\next -> MapExpr function next location) "List.map argument is stuck."
  | otherwise = case values of
      ListLiteral items _ -> case function of
        Lambda _ _ _ ->
          let work = MapWork function items [] Nothing location
              currentIndex = if Array.null items then Nothing else Just 0
          in Right (Just (listEvent work location currentIndex items [] Nothing "Start mapping over the list."))
        _ -> Left "List.map expects a function as its first argument."
      _ -> Left "List.map expects a list as its second argument."
stepMapWork
  :: Stepper
  -> Array Definition
  -> Expr
  -> Array Expr
  -> Array Expr
  -> Maybe Expr
  -> SourceSpan
  -> Either String (Maybe Transition)
stepMapWork recurse definitions function pending completed current location = case current of
  Just expression
    | isValue expression -> case Array.uncons pending of
        Nothing -> finish
        Just { head: _, tail } ->
          let done = Array.snoc completed expression
              nextWork = MapWork function tail done Nothing location
              index = Array.length completed
          in Right (Just (listEvent nextWork location (Just index) (done <> tail) done Nothing "Put the mapped value in its box."))
    | otherwise -> do
        next <- recurse definitions expression
        case next of
          Nothing -> Left "The current map function call is stuck."
          Just transition ->
            let index = Array.length completed
                nextWork = MapWork function pending completed (Just transition.expression) location
            in Right (Just (listEvent nextWork transition.focus (Just index) (completed <> pending) completed Nothing transition.note))
  Nothing -> case Array.uncons pending of
    Nothing -> finish
    Just { head: item } ->
      let index = Array.length completed
          call = Apply function item location
          nextWork = MapWork function pending completed (Just call) location
      in Right (Just (listEvent nextWork location (Just index) (completed <> pending) completed Nothing "Apply the function to the lit box."))
  where
  finish =
    Right (Just (event (ListLiteral completed location) location "The mapped list is complete."))

stepFoldl
  :: Stepper
  -> Array Definition
  -> Expr
  -> Expr
  -> Expr
  -> SourceSpan
  -> Either String (Maybe Transition)
stepFoldl recurse definitions function initial values location
  | not (isValue function) = stepChild recurse definitions function (\next -> FoldlExpr next initial values location) "List.foldl argument is stuck."
  | not (isValue initial) = stepChild recurse definitions initial (\next -> FoldlExpr function next values location) "List.foldl argument is stuck."
  | not (isValue values) = stepChild recurse definitions values (\next -> FoldlExpr function initial next location) "List.foldl argument is stuck."
  | otherwise = case values of
      ListLiteral items _ -> case function of
        Lambda _ _ _ ->
          let work = FoldlWork function initial items Nothing 0 items location
          in Right (Just (listEvent work location (if Array.null items then Nothing else Just 0) items [] (Just initial) "Start the left fold."))
        _ -> Left "List.foldl expects a function as its first argument."
      _ -> Left "List.foldl expects a list as its third argument."
stepFoldlWork
  :: Stepper
  -> Array Definition
  -> Expr
  -> Expr
  -> Array Expr
  -> Maybe Expr
  -> Int
  -> Array Expr
  -> SourceSpan
  -> Either String (Maybe Transition)
stepFoldlWork recurse definitions function accumulator pending current index allItems location = case current of
  Just expression
    | isValue expression -> case Array.uncons pending of
        Nothing -> finish
        Just { head: _, tail } ->
          let nextWork = FoldlWork function expression tail Nothing (index + 1) allItems location
          in Right (Just (listEvent nextWork location (Just index) allItems [] (Just expression) "Update the fold accumulator."))
    | otherwise -> do
        next <- recurse definitions expression
        case next of
          Nothing -> Left "The current fold step is stuck."
          Just transition ->
            let nextWork = FoldlWork function accumulator pending (Just transition.expression) index allItems location
            in Right (Just (listEvent nextWork transition.focus (Just index) allItems [] (Just accumulator) transition.note))
  Nothing -> case Array.uncons pending of
    Nothing -> finish
    Just { head: item } ->
      let partial = Apply function accumulator location
          call = Apply partial item location
          nextWork = FoldlWork function accumulator pending (Just call) index allItems location
      in Right (Just (listEvent nextWork location (Just index) allItems [] (Just accumulator) "Combine the accumulator with the lit box."))
  where
  finish = Right (Just (event accumulator location "The left fold is complete."))

isValue :: Expr -> Boolean
isValue expression = case expression of
  Natural _ _ -> true
  Lambda _ _ _ -> true
  ListLiteral items _ -> Array.all isValue items
  _ -> false

event :: Expr -> SourceSpan -> String -> Transition
event expression focus note =
  { expression
  , focus
  , activeIndex: Nothing
  , inputItems: []
  , outputItems: []
  , accumulator: Nothing
  , note
  }

listEvent :: Expr -> SourceSpan -> Maybe Int -> Array Expr -> Array Expr -> Maybe Expr -> String -> Transition
listEvent expression focus activeIndex inputItems outputItems accumulator note =
  { expression, focus, activeIndex, inputItems, outputItems, accumulator, note }

substitute :: String -> Expr -> Expr -> Expr
substitute name replacement expression = case expression of
  Natural _ _ -> expression
  Identifier other _ | other == name -> replacement
  Identifier _ _ -> expression
  ListLiteral items location -> ListLiteral (map (substitute name replacement) items) location
  Let bound value body location ->
    let nextValue = substitute name replacement value
        nextBody = if bound == name then body else substitute name replacement body
    in Let bound nextValue nextBody location
  Lambda parameter body location ->
    if parameter == name then expression else Lambda parameter (substitute name replacement body) location
  Apply function argument location ->
    Apply (substitute name replacement function) (substitute name replacement argument) location
  Binary operator left right location ->
    Binary operator (substitute name replacement left) (substitute name replacement right) location
  MapExpr function values location ->
    MapExpr (substitute name replacement function) (substitute name replacement values) location
  FoldlExpr function initial values location ->
    FoldlExpr (substitute name replacement function) (substitute name replacement initial) (substitute name replacement values) location
  MapWork function pending completed current location ->
    MapWork (substitute name replacement function) (map (substitute name replacement) pending)
      (map (substitute name replacement) completed) (map (substitute name replacement) current) location
  FoldlWork function accumulator pending current index items location ->
    FoldlWork (substitute name replacement function) (substitute name replacement accumulator)
      (map (substitute name replacement) pending) (map (substitute name replacement) current) index
      (map (substitute name replacement) items) location

renderExpr :: Expr -> String
renderExpr expression = case expression of
  Natural value _ -> show value
  Identifier name _ -> name
  ListLiteral items _ -> "[" <> String.joinWith ", " (map renderExpr items) <> "]"
  Let name value body _ -> "let " <> name <> " := " <> renderExpr value <> "; " <> renderExpr body
  Lambda name body _ -> "fun " <> name <> " => " <> renderExpr body
  Apply function argument _ -> atom function <> " " <> atom argument
  Binary operator left right _ -> "(" <> renderExpr left <> operatorText operator <> renderExpr right <> ")"
  MapExpr function values _ -> "List.map " <> atom function <> " " <> atom values
  FoldlExpr function initial values _ -> "List.foldl " <> atom function <> " " <> atom initial <> " " <> atom values
  MapWork function pending completed current _ ->
    "List.map " <> atom function <> " " <> renderExpr (ListLiteral (completed <> pending) (expressionSpan expression))
      <> maybeCurrent current
  FoldlWork function accumulator pending current _ _ _ ->
    "List.foldl " <> atom function <> " " <> renderExpr accumulator <> " "
      <> renderExpr (ListLiteral pending (expressionSpan expression)) <> maybeCurrent current
  where
  atom value = case value of
    Natural _ _ -> renderExpr value
    Identifier _ _ -> renderExpr value
    ListLiteral _ _ -> renderExpr value
    _ -> "(" <> renderExpr value <> ")"
  maybeCurrent Nothing = ""
  maybeCurrent (Just value) = "  -- current: " <> renderExpr value

operatorText :: Operator -> String
operatorText Add = " + "
operatorText Subtract = " - "
operatorText Multiply = " * "

stepChild :: Stepper -> Array Definition -> Expr -> (Expr -> Expr) -> String -> Either String (Maybe Transition)
stepChild recurse definitions child rebuild errorMessage = do
  next <- recurse definitions child
  case next of
    Nothing -> Left errorMessage
    Just transition -> Right (Just (transition { expression = rebuild transition.expression }))
