module LeanSubset.Parser
  ( parse
  , parseExpression
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import LeanSubset.Lexer (Token, TokenKind(..))
import LeanSubset.Syntax (Command(..), Expr(..), Operator(..), SourceSpan)

type Parsed a = Either String (Tuple a (Array Token))
type RecursiveParser = Array Token -> Parsed Expr

parse :: Array Token -> Either String (Array Command)
parse tokens = parseCommands tokens []
  where
  parseCommands remaining commands =
    case Array.uncons (skipSeparators remaining) of
      Nothing -> Right commands
      Just { head: token, tail } -> case token.kind of
        EndToken -> Right commands
        DirectiveToken "eval" -> do
          Tuple expression rest <- parseExpression tail
          let location = { start: token.start, end: (spanOf expression).end }
          parseCommands (requireBoundary rest) (Array.snoc commands (Eval expression location))
        KeywordToken "def" -> do
          Tuple name nameRest <- expectName tail
          Tuple _ equalsRest <- expectSymbol ":=" nameRest
          Tuple expression rest <- parseExpression equalsRest
          let location = { start: token.start, end: (spanOf expression).end }
          parseCommands (requireBoundary rest) (Array.snoc commands (Define name expression location))
        _ -> Left ("Expected #eval or def at character " <> show token.start <> ".")

  skipSeparators remaining = case Array.uncons remaining of
    Just { head: token, tail } | token.kind == NewlineToken || token.kind == SymbolToken ";" -> skipSeparators tail
    _ -> remaining

  requireBoundary remaining = case Array.uncons remaining of
    Just { head: token, tail } | token.kind == NewlineToken || token.kind == EndToken -> tail
    Just { head: token } -> [ token ]
    Nothing -> []

parseExpression :: Array Token -> Parsed Expr
parseExpression = fixParser parseAdd

fixParser :: (RecursiveParser -> RecursiveParser) -> RecursiveParser
fixParser parser = parser (fixParser parser)

parseAdd :: RecursiveParser -> RecursiveParser
parseAdd recurse tokens = do
  Tuple first rest <- parseMultiply recurse tokens
  parseAddTail recurse first rest

parseAddTail :: RecursiveParser -> Expr -> Array Token -> Parsed Expr
parseAddTail recurse left tokens = case Array.uncons tokens of
  Just { head: token, tail } | token.kind == SymbolToken "+" -> do
    Tuple right rest <- parseMultiply recurse tail
    parseAddTail recurse (combine Add left right) rest
  Just { head: token, tail } | token.kind == SymbolToken "-" -> do
    Tuple right rest <- parseMultiply recurse tail
    parseAddTail recurse (combine Subtract left right) rest
  _ -> Right (Tuple left tokens)

parseMultiply :: RecursiveParser -> Array Token -> Parsed Expr
parseMultiply recurse tokens = do
  Tuple first rest <- parseApplication recurse tokens
  parseMultiplyTail recurse first rest

parseMultiplyTail :: RecursiveParser -> Expr -> Array Token -> Parsed Expr
parseMultiplyTail recurse left tokens = case Array.uncons tokens of
  Just { head: token, tail } | token.kind == SymbolToken "*" -> do
    Tuple right rest <- parseApplication recurse tail
    parseMultiplyTail recurse (combine Multiply left right) rest
  _ -> Right (Tuple left tokens)

parseApplication :: RecursiveParser -> Array Token -> Parsed Expr
parseApplication recurse tokens = do
  Tuple function rest <- parseAtom recurse tokens
  parseApplicationTail recurse function rest

parseApplicationTail :: RecursiveParser -> Expr -> Array Token -> Parsed Expr
parseApplicationTail recurse function tokens = case Array.uncons tokens of
  Just { head: token } | beginsAtom token.kind -> do
    Tuple argument rest <- parseAtom recurse tokens
    parseApplicationTail recurse (Apply function argument (joinSpans (spanOf function) (spanOf argument))) rest
  _ -> Right (Tuple function tokens)

parseAtom :: RecursiveParser -> Array Token -> Parsed Expr
parseAtom recurse tokens = case Array.uncons tokens of
  Nothing -> Left "Expected an expression, but reached the end of input."
  Just { head: token, tail } -> case token.kind of
    NumberToken value -> Right (Tuple (Natural value (tokenSpan token)) tail)
    NameToken "List.map" -> parseMap token tail
    NameToken "List.foldl" -> parseFoldl token tail
    NameToken name -> Right (Tuple (Identifier name (tokenSpan token)) tail)
    KeywordToken "fun" -> parseLambda recurse token tail
    KeywordToken "let" -> parseLet recurse token tail
    SymbolToken "(" -> do
      Tuple expression rest <- recurse tail
      Tuple closing remainder <- expectSymbol ")" rest
      Right (Tuple (reSpan (token.start) closing.end expression) remainder)
    SymbolToken "[" -> parseList recurse token tail []
    _ -> Left ("Expected an expression at character " <> show token.start <> ".")

parseMap :: Token -> Array Token -> Parsed Expr
parseMap head tokens = do
  Tuple function functionRest <- parseAtom (fixParser parseAdd) tokens
  Tuple values remaining <- parseAtom (fixParser parseAdd) functionRest
  Right (Tuple (MapExpr function values { start: head.start, end: (spanOf values).end }) remaining)

parseFoldl :: Token -> Array Token -> Parsed Expr
parseFoldl head tokens = do
  Tuple function functionRest <- parseAtom (fixParser parseAdd) tokens
  Tuple initial initialRest <- parseAtom (fixParser parseAdd) functionRest
  Tuple values remaining <- parseAtom (fixParser parseAdd) initialRest
  Right (Tuple (FoldlExpr function initial values { start: head.start, end: (spanOf values).end }) remaining)

parseLambda :: RecursiveParser -> Token -> Array Token -> Parsed Expr
parseLambda recurse start tokens = do
  Tuple parameters rest <- parseParameters tokens []
  Tuple _ arrowRest <- expectSymbol "=>" rest
  Tuple body remaining <- recurse arrowRest
  let wrapped = Array.foldr (\parameter expression -> Lambda parameter expression { start: start.start, end: (spanOf expression).end }) body parameters
  Right (Tuple wrapped remaining)

parseParameters :: Array Token -> Array String -> Parsed (Array String)
parseParameters tokens parameters = case Array.uncons tokens of
  Just { head: token, tail } -> case token.kind of
    NameToken name -> parseParameters tail (Array.snoc parameters name)
    _ | not (Array.null parameters) -> Right (Tuple parameters tokens)
    _ -> Left ("Expected a function parameter at character " <> show token.start <> ".")
  Nothing | not (Array.null parameters) -> Right (Tuple parameters [])
  Nothing -> Left "Expected a function parameter, but reached the end of input."

parseLet :: RecursiveParser -> Token -> Array Token -> Parsed Expr
parseLet recurse start tokens = do
  Tuple name rest <- expectName tokens
  Tuple _ assignRest <- expectSymbol ":=" rest
  Tuple value valueRest <- recurse assignRest
  Tuple _ bodyRest <- expectSymbol ";" valueRest
  Tuple body remaining <- recurse bodyRest
  Right (Tuple (Let name value body { start: start.start, end: (spanOf body).end }) remaining)

parseList :: RecursiveParser -> Token -> Array Token -> Array Expr -> Parsed Expr
parseList recurse opening tokens items = case Array.uncons tokens of
  Just { head: token, tail } | token.kind == SymbolToken "]" ->
    Right (Tuple (ListLiteral items { start: opening.start, end: token.end }) tail)
  _ -> do
    Tuple item rest <- recurse tokens
    case Array.uncons rest of
      Just { head: comma, tail } | comma.kind == SymbolToken "," -> parseList recurse opening tail (Array.snoc items item)
      Just { head: closing, tail } | closing.kind == SymbolToken "]" ->
        Right (Tuple (ListLiteral (Array.snoc items item) { start: opening.start, end: closing.end }) tail)
      Just { head: token } -> Left ("Expected ',' or ']' at character " <> show token.start <> ".")
      Nothing -> Left "List literal is missing its closing ']'."

expectName :: Array Token -> Parsed String
expectName tokens = case Array.uncons tokens of
  Just { head: token, tail } -> case token.kind of
    NameToken name -> Right (Tuple name tail)
    _ -> Left ("Expected a name at character " <> show token.start <> ".")
  Nothing -> Left "Expected a name, but reached the end of input."

expectSymbol :: String -> Array Token -> Parsed Token
expectSymbol expected tokens = case Array.uncons tokens of
  Just { head: token, tail } | token.kind == SymbolToken expected -> Right (Tuple token tail)
  Just { head: token } -> Left ("Expected '" <> expected <> "' at character " <> show token.start <> ".")
  Nothing -> Left ("Expected '" <> expected <> "', but reached the end of input.")

beginsAtom :: TokenKind -> Boolean
beginsAtom kind = case kind of
  NumberToken _ -> true
  NameToken _ -> true
  KeywordToken "fun" -> true
  KeywordToken "let" -> true
  SymbolToken "(" -> true
  SymbolToken "[" -> true
  _ -> false

combine :: Operator -> Expr -> Expr -> Expr
combine operator left right = Binary operator left right (joinSpans (spanOf left) (spanOf right))

spanOf :: Expr -> SourceSpan
spanOf = case _ of
  Natural _ location -> location
  ListLiteral _ location -> location
  Identifier _ location -> location
  Let _ _ _ location -> location
  Lambda _ _ location -> location
  Apply _ _ location -> location
  Binary _ _ _ location -> location
  MapExpr _ _ location -> location
  FoldlExpr _ _ _ location -> location
  MapWork _ _ _ _ location -> location
  FoldlWork _ _ _ _ _ _ location -> location

tokenSpan :: Token -> SourceSpan
tokenSpan token = { start: token.start, end: token.end }

joinSpans :: SourceSpan -> SourceSpan -> SourceSpan
joinSpans left right = { start: left.start, end: right.end }

reSpan :: Int -> Int -> Expr -> Expr
reSpan start end expression = case expression of
  Natural value _ -> Natural value { start, end }
  ListLiteral values _ -> ListLiteral values { start, end }
  Identifier name _ -> Identifier name { start, end }
  Let name value body _ -> Let name value body { start, end }
  Lambda parameter body _ -> Lambda parameter body { start, end }
  Apply function argument _ -> Apply function argument { start, end }
  Binary operator left right _ -> Binary operator left right { start, end }
  MapExpr function values _ -> MapExpr function values { start, end }
  FoldlExpr function initial values _ -> FoldlExpr function initial values { start, end }
  MapWork function pending done current _ -> MapWork function pending done current { start, end }
  FoldlWork function accumulator pending current index items _ -> FoldlWork function accumulator pending current index items { start, end }
