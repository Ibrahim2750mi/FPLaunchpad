module LeanSubset.Syntax
  ( SourceSpan
  , Operator(..)
  , Expr(..)
  , Command(..)
  , expressionSpan
  , commandSpan
  ) where

import Prelude

import Data.Maybe (Maybe)

type SourceSpan =
  { start :: Int
  , end :: Int
  }

data Operator = Add | Subtract | Multiply

derive instance eqOperator :: Eq Operator

data Expr
  = Natural Int SourceSpan
  | ListLiteral (Array Expr) SourceSpan
  | Identifier String SourceSpan
  | Let String Expr Expr SourceSpan
  | Lambda String Expr SourceSpan
  | Apply Expr Expr SourceSpan
  | Binary Operator Expr Expr SourceSpan
  | MapExpr Expr Expr SourceSpan
  | FoldlExpr Expr Expr Expr SourceSpan
  | MapWork Expr (Array Expr) (Array Expr) (Maybe Expr) SourceSpan
  | FoldlWork Expr Expr (Array Expr) (Maybe Expr) Int (Array Expr) SourceSpan

data Command
  = Eval Expr SourceSpan
  | Define String Expr SourceSpan

expressionSpan :: Expr -> SourceSpan
expressionSpan (Natural _ location) = location
expressionSpan (ListLiteral _ location) = location
expressionSpan (Identifier _ location) = location
expressionSpan (Let _ _ _ location) = location
expressionSpan (Lambda _ _ location) = location
expressionSpan (Apply _ _ location) = location
expressionSpan (Binary _ _ _ location) = location
expressionSpan (MapExpr _ _ location) = location
expressionSpan (FoldlExpr _ _ _ location) = location
expressionSpan (MapWork _ _ _ _ location) = location
expressionSpan (FoldlWork _ _ _ _ _ _ location) = location

commandSpan :: Command -> SourceSpan
commandSpan (Eval _ location) = location
commandSpan (Define _ _ location) = location
