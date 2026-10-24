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
            location = expressionSpan expression
        in response machine "" expression location (-1) [] [] "" "Ready to reduce." false 0

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
        in response advanced "" transition.expression transition.focus
             (fromMaybe (-1) transition.activeIndex)
             (map renderExpr transition.inputItems)
             (map renderExpr transition.outputItems)
             (mapMaybeText transition.accumulator)
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
