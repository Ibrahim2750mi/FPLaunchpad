module ProofPlayer
  ( Edge
  , ProofStep(..)
  , ProofState
  , reachDestination
  , initialState
  , applyStep
  , runNext
  , runNextForUi
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))

-- The deliberately small proof language used by the first graph example.
-- These are proof-player actions, not Lean syntax or Lean's kernel rules.
type Edge = { from :: String, to :: String }

data ProofStep
  = AddEdge String String
  | FinishPath

reachDestination :: Array ProofStep
reachDestination =
  [ AddEdge "A" "B"
  , AddEdge "B" "C"
  , AddEdge "C" "D"
  , FinishPath
  ]

type ProofState =
  { edges :: Array Edge
  , solved :: Boolean
  }

initialState :: ProofState
initialState = { edges: [], solved: false }

applyStep :: ProofStep -> ProofState -> Either String ProofState
applyStep (AddEdge from to) state
  | state.solved = Left "This proof is already complete."
  | Array.any (\edge -> edge.from == from && edge.to == to) state.edges =
      Left "That edge is already in the path."
  | otherwise = Right (state { edges = Array.snoc state.edges { from, to } })
applyStep FinishPath state
  | state.solved = Left "This proof is already complete."
  | hasEdge "A" "B" state.edges && hasEdge "B" "C" state.edges && hasEdge "C" "D" state.edges =
      Right (state { solved = true })
  | otherwise = Left "Add the A–B, B–C, and C–D edges before finishing the path."

hasEdge :: String -> String -> Array Edge -> Boolean
hasEdge from to = Array.any (\edge -> edge.from == from && edge.to == to)

-- Advance one scripted action. The index counts completed proof actions.
runNext
  :: Array ProofStep
  -> { index :: Int, state :: ProofState }
  -> Either String { index :: Int, state :: ProofState }
runNext script cursor =
  case Array.index script cursor.index of
    Nothing -> Left "There are no more proof steps."
    Just proofStep -> do
      nextState <- applyStep proofStep cursor.state
      pure { index: cursor.index + 1, state: nextState }

-- A plain-record adapter keeps the browser boundary independent of the
-- compiler's runtime representation for Either.
runNextForUi
  :: Array ProofStep
  -> { index :: Int, state :: ProofState }
  -> { index :: Int, state :: ProofState, error :: String }
runNextForUi script cursor =
  case runNext script cursor of
    Left message -> { index: cursor.index, state: cursor.state, error: message }
    Right next -> { index: next.index, state: next.state, error: "" }
