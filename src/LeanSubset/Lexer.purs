module LeanSubset.Lexer
  ( Token(..)
  , TokenKind(..)
  , lex
  ) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String.CodeUnits as CodeUnits

data TokenKind
  = NameToken String
  | NumberToken Int
  | KeywordToken String
  | DirectiveToken String
  | SymbolToken String
  | NewlineToken
  | EndToken

derive instance eqTokenKind :: Eq TokenKind

instance showTokenKind :: Show TokenKind where
  show (NameToken name) = "name " <> name
  show (NumberToken value) = "number " <> show value
  show (KeywordToken keyword) = "keyword " <> keyword
  show (DirectiveToken directive) = "directive #" <> directive
  show (SymbolToken symbol) = "symbol " <> symbol
  show NewlineToken = "newline"
  show EndToken = "end of input"

type Token =
  { kind :: TokenKind
  , lexeme :: String
  , start :: Int
  , end :: Int
  }

lex :: String -> Either String (Array Token)
lex source = scan 0 []
  where
  chars = CodeUnits.toCharArray source
  size = Array.length chars

  charAt index = fromMaybe ' ' (Array.index chars index)

  make kind lexeme start end = { kind, lexeme, start, end }

  scan index tokens
    | index >= size = Right (Array.snoc tokens (make EndToken "" index index))
    | isHorizontalSpace (charAt index) = scan (index + 1) tokens
    | charAt index == '\n' = scan (index + 1) (Array.snoc tokens (make NewlineToken "\n" index (index + 1)))
    | charAt index == '\r' = scan (index + 1) tokens
    | startsComment index = scan (skipToNewline index) tokens
    | isDigit (charAt index) = lexNumber index tokens
    | isNameStart (charAt index) = lexName index tokens
    | charAt index == '#' = lexDirective index tokens
    | otherwise = lexSymbol index tokens

  lexNumber start tokens =
    let end = consumeWhile isDigit start
        text = slice start end
    in case Int.fromString text of
      Nothing -> Left ("Invalid number at character " <> show start <> ".")
      Just value -> scan end (Array.snoc tokens (make (NumberToken value) text start end))

  lexName start tokens =
    let end = consumeWhile isNameContinue start
        text = slice start end
        kind = if isKeyword text then KeywordToken text else NameToken text
    in scan end (Array.snoc tokens (make kind text start end))

  lexDirective start tokens =
    let nameStart = start + 1
        end = consumeWhile isNameContinue nameStart
        text = slice nameStart end
    in if text == "eval" then
      scan end (Array.snoc tokens (make (DirectiveToken text) ("#" <> text) start end))
    else Left ("Unknown Lean directive at character " <> show start <> ".")

  lexSymbol start tokens =
    let pair = slice start (min size (start + 2))
        result =
          if pair == ":=" || pair == "=>" || pair == "->" || pair == "==" || pair == "<=" then
            { symbol: pair, width: 2 }
          else
            { symbol: CodeUnits.singleton (charAt start), width: 1 }
    in if isSupportedSymbol result.symbol then
      scan (start + result.width) (Array.snoc tokens (make (SymbolToken result.symbol) result.symbol start (start + result.width)))
    else Left ("Unexpected character '" <> result.symbol <> "' at character " <> show start <> ".")

  consumeWhile predicate index
    | index < size && predicate (charAt index) = consumeWhile predicate (index + 1)
    | otherwise = index

  slice start end = CodeUnits.fromCharArray (Array.slice start end chars)

  startsComment index = charAt index == '-' && charAt (index + 1) == '-'

  skipToNewline index
    | index < size && charAt index /= '\n' = skipToNewline (index + 1)
    | otherwise = index

isHorizontalSpace :: Char -> Boolean
isHorizontalSpace char = char == ' ' || char == '\t' || char == '\r'

isDigit :: Char -> Boolean
isDigit char = char >= '0' && char <= '9'

isNameStart :: Char -> Boolean
isNameStart char =
  (char >= 'a' && char <= 'z')
    || (char >= 'A' && char <= 'Z')
    || char == '_'

isNameContinue :: Char -> Boolean
isNameContinue char = isNameStart char || isDigit char || char == '.'

isKeyword :: String -> Boolean
isKeyword word = word == "let" || word == "in" || word == "fun" || word == "def"

isSupportedSymbol :: String -> Boolean
isSupportedSymbol symbol =
  symbol == ":=" || symbol == "=>" || symbol == "->" || symbol == "==" || symbol == "<="
    || symbol == "=" || symbol == "+" || symbol == "-" || symbol == "*"
    || symbol == "(" || symbol == ")" || symbol == "[" || symbol == "]"
    || symbol == "," || symbol == ":"
