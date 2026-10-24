module LeanSubset.Runner
  ( MachineState
  , UiResponse
  , startForUi
  , stepForUi
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Tuple (Tuple(..))
import LeanSubset.Evaluator (Definition, reduceOnce, renderExpr)
import LeanSubset.Lexer as Lexer
import LeanSubset.Parser as Parser
import LeanSubset.Syntax (Command(..), Expr(..), expressionSpan)

type MachineState =
  { source :: String
  , definitions :: Array Definition
  , expression :: Expr
  , stepCount :: Int
  , done :: Boolean
  }

type UiResponse =
  { machine :: MachineState
  , error :: String
  , expressionText :: String
  , focusStart :: Int
  , focusEnd :: Int
  , activeIndex :: Int
  , inputItems :: Array String
  , outputItems :: Array String
  , accumulatorText :: String
  , note :: String
  , done :: Boolean
  , stepCount :: Int
  }

startForUi :: String -> UiResponse
startForUi source = case Lexer.lex source of
  Left message -> errorResponse source message
  Right tokens -> case Parser.parse tokens of
    Left message -> errorResponse source message
    Right commands -> case findEval commands [] of
      Left message -> errorResponse source message
      Right (Tuple definitions expression) ->
        let machine = { source, definitions, expression, stepCount: 0, done: false }
            view = initialView expression
        in response machine "" expression { start: -1, end: -1 } view.activeIndex view.inputItems []
             view.accumulatorText view.note false 0

stepForUi :: MachineState -> UiResponse
stepForUi machine
  | machine.done = response machine "" machine.expression (expressionSpan machine.expression) (-1) [] [] "" "Evaluation is complete." true machine.stepCount
  | otherwise = case reduceOnce machine.definitions machine.expression of
      Left message -> errorResponse machine.source message
      Right Nothing ->
        let finished = machine { done = true }
            location = expressionSpan machine.expression
        in response finished "" machine.expression location (-1) [] [] "" "Expression is fully reduced." true machine.stepCount
      Right (Just transition) ->
        let advanced = machine { expression = transition.expression, stepCount = machine.stepCount + 1 }
            view = initialView transition.expression
        in response advanced "" transition.expression transition.focus
             (fromMaybe view.activeIndex transition.activeIndex)
             (if Array.null transition.inputItems then view.inputItems else map renderExpr transition.inputItems)
             (map renderExpr transition.outputItems)
             (if mapMaybeText transition.accumulator == "" then view.accumulatorText else mapMaybeText transition.accumulator)
             transition.note false advanced.stepCount

findEval :: Array Command -> Array Definition -> Either String (Tuple (Array Definition) Expr)
findEval commands definitions = case Array.uncons commands of
  Nothing -> Left "Add a #eval expression to run the interpreter."
  Just { head: command, tail } -> case command of
    Define name expression _ -> findEval tail (Array.snoc definitions (Tuple name expression))
    Eval expression _ -> Right (Tuple definitions expression)

errorResponse :: String -> String -> UiResponse
errorResponse source message =
  let placeholder = { source, definitions: [], expression: Natural 0 { start: 0, end: 0 }, stepCount: 0, done: true }
  in response placeholder message placeholder.expression { start: 0, end: 0 } (-1) [] [] "" "" true 0

response
  :: MachineState
  -> String
  -> Expr
  -> { start :: Int, end :: Int }
  -> Int
  -> Array String
  -> Array String
  -> String
  -> String
  -> Boolean
  -> Int
  -> UiResponse
response machine error expression location activeIndex inputItems outputItems accumulator note done stepCount =
  { machine
  , error
  , expressionText: renderExpr expression
  , focusStart: location.start
  , focusEnd: location.end
  , activeIndex
  , inputItems
  , outputItems
  , accumulatorText: accumulator
  , note
  , done
  , stepCount
  }

mapMaybeText :: Maybe Expr -> String
mapMaybeText Nothing = ""
mapMaybeText (Just expression) = renderExpr expression

type InitialView =
  { activeIndex :: Int
  , inputItems :: Array String
  , accumulatorText :: String
  , note :: String
  }

initialView :: Expr -> InitialView
initialView = search []
  where
  emptyView = { activeIndex: -1, inputItems: [], accumulatorText: "", note: "Ready to reduce." }

  search bindings expression = case expression of
    Let name value body _ ->
      let nextBindings = case value of
            ListLiteral _ _ -> Array.snoc bindings (Tuple name value)
            _ -> bindings
      in search nextBindings body
    MapExpr _ values _ ->
      let items = resolveList bindings values
      in { activeIndex: if Array.null items then -1 else 0
         , inputItems: map renderExpr items
         , accumulatorText: ""
         , note: "Ready to map the list."
         }
    FoldlExpr _ accumulator values _ ->
      let items = resolveList bindings values
      in { activeIndex: if Array.null items then -1 else 0
         , inputItems: map renderExpr items
         , accumulatorText: renderExpr accumulator
         , note: "Ready to fold from the initial accumulator."
         }
    _ -> emptyView

resolveList :: Array (Tuple String Expr) -> Expr -> Array Expr
resolveList bindings expression = case expression of
  ListLiteral items _ -> items
  Identifier name _ -> case Array.find (\(Tuple key _) -> key == name) (Array.reverse bindings) of
    Just (Tuple _ (ListLiteral items _)) -> items
    _ -> []
  _ -> []
