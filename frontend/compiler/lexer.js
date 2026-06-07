/**
 * BASIC JIT — JavaScript Lexer
 * Port of src/parser/scanner.c to JavaScript
 * Produces a token stream for visualization purposes.
 */

const TokenType = {
  // Keywords
  REM: 'REM', END: 'END', STOP: 'STOP', KEY: 'KEY', RETURN: 'RETURN',
  RAN: 'RAN', BEEP: 'BEEP', TAB: 'TAB', SPC: 'SPC',
  SIN: 'SIN', COS: 'COS', TAN: 'TAN', ASN: 'ASN', ACS: 'ACS', ATN: 'ATN',
  LOG: 'LOG', LN: 'LN', EXP: 'EXP', SQR: 'SQR', ABS: 'ABS', SGN: 'SGN',
  INT: 'INT', FRAC: 'FRAC', RND: 'RND', DEG: 'DEG', RAD: 'RAD',
  VAL: 'VAL', STR: 'STR',
  GOTO: 'GOTO', GOSUB: 'GOSUB', NEXT: 'NEXT', RESTORE: 'RESTORE',
  LET: 'LET', IF: 'IF', THEN: 'THEN', ELSE: 'ELSE', FOR: 'FOR', ON: 'ON',
  MOD: 'MOD', INPUT: 'INPUT', PRINT: 'PRINT', DATA: 'DATA', READ: 'READ',
  TO: 'TO', STEP: 'STEP', DIM: 'DIM', RUN: 'RUN', LIST: 'LIST', NEW: 'NEW',
  LEFT: 'LEFT', RIGHT: 'RIGHT', SLEEP: 'SLEEP', ASSERT: 'ASSERT',
  AND: 'AND', OR: 'OR', XOR: 'XOR', NOT: 'NOT',
  TRUE: 'TRUE', FALSE: 'FALSE',
  CHR: 'CHR', ASC: 'ASC', SAVE: 'SAVE', LOAD: 'LOAD',
  DEF: 'DEF', FN: 'FN', LEN: 'LEN', EDIT: 'EDIT', EXT: 'EXT', DLIB: 'DLIB',

  // Operators
  PLUS: 'PLUS', MINUS: 'MINUS', STAR: 'STAR', SLASH: 'SLASH',
  PERCENT: 'PERCENT', CARET: 'CARET',
  EQ: 'EQ', GT: 'GT', LT: 'LT', GE: 'GE', LE: 'LE', NE: 'NE',
  COLON: 'COLON', COMMA: 'COMMA', DOLLAR: 'DOLLAR', DOT: 'DOT',
  BRAC_OPEN: 'BRAC_OPEN', BRAC_CLOSE: 'BRAC_CLOSE',
  QUESTION_MARK: 'QUESTION_MARK',

  // Literals
  STRING: 'STRING', FLOAT: 'FLOAT', INTEGER: 'INTEGER',
  IDENTIFIER: 'IDENTIFIER', EOF: 'EOF',
  NONE: 'NONE',
};

// Token categories for visualization
const TokenCategory = {
  KEYWORD: 'keyword',
  OPERATOR: 'operator',
  LITERAL: 'literal',
  IDENTIFIER: 'identifier',
  STRING: 'string',
  COMMENT: 'comment',
  PUNCTUATION: 'punctuation',
  TYPE_SUFFIX: 'type_suffix',
  EOF: 'eof',
};

const KEYWORDS_SET = new Set([
  'REM','END','STOP','KEY','RETURN','RAN','BEEP','TAB','SPC',
  'SIN','COS','TAN','ASN','ACS','ATN','LOG','LN','EXP','SQR','ABS','SGN',
  'INT','FRAC','RND','DEG','RAD','VAL','STR',
  'GOTO','GOSUB','NEXT','RESTORE','LET','IF','THEN','ELSE','FOR','ON',
  'MOD','INPUT','PRINT','DATA','READ','TO','STEP','DIM','RUN','LIST','NEW',
  'LEFT','RIGHT','SLEEP','ASSERT',
  'AND','OR','XOR','NOT','TRUE','FALSE',
  'CHR','ASC','SAVE','LOAD','DEF','FN','LEN','EDIT','EXT','DLIB',
]);

const MATH_FUNCTIONS = new Set([
  'SIN','COS','TAN','ASN','ACS','ATN','LOG','LN','EXP','SQR','ABS','SGN',
  'INT','FRAC','RND','DEG','RAD','VAL','STR','CHR','ASC','LEN',
  'TAB','SPC','LEFT','RIGHT',
]);

const CONTROL_FLOW = new Set([
  'GOTO','GOSUB','IF','THEN','ELSE','FOR','NEXT','TO','STEP','ON',
  'RETURN','STOP','END','RUN',
]);

function classifyToken(type) {
  if (type === TokenType.REM) return TokenCategory.COMMENT;
  if (type === TokenType.STRING) return TokenCategory.STRING;
  if (type === TokenType.INTEGER || type === TokenType.FLOAT) return TokenCategory.LITERAL;
  if (type === TokenType.IDENTIFIER) return TokenCategory.IDENTIFIER;
  if (type === TokenType.EOF) return TokenCategory.EOF;
  if (type === TokenType.DOLLAR || type === TokenType.PERCENT || type === TokenType.QUESTION_MARK) return TokenCategory.TYPE_SUFFIX;
  if (type === TokenType.COMMA || type === TokenType.COLON || type === TokenType.DOT ||
      type === TokenType.BRAC_OPEN || type === TokenType.BRAC_CLOSE) return TokenCategory.PUNCTUATION;
  if (KEYWORDS_SET.has(type)) return TokenCategory.KEYWORD;
  return TokenCategory.OPERATOR;
}

function isAlpha(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isDigit(c) {
  return c >= '0' && c <= '9';
}

function isAlphaNum(c) {
  return isAlpha(c) || isDigit(c);
}

function isHexChar(c) {
  return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

function isWhitespace(c) {
  return c === ' ' || c === '\t' || c === '\r';
}

/**
 * Tokenize a single line of BASIC code.
 * Returns an array of token objects.
 */
function tokenizeLine(input, lineNumber) {
  const tokens = [];
  let offset = 0;

  function peek(ahead = 0) {
    return input[offset + ahead] || '\0';
  }

  function skipWhitespace() {
    while (offset < input.length && isWhitespace(input[offset])) {
      offset++;
    }
  }

  while (offset < input.length) {
    skipWhitespace();
    if (offset >= input.length) break;

    const startOffset = offset;
    const ch = input[offset];

    // Identifier or keyword
    if (isAlpha(ch)) {
      let len = 1;
      while (offset + len < input.length && isAlphaNum(input[offset + len])) {
        len++;
      }
      const word = input.substring(offset, offset + len);
      const upper = word.toUpperCase();
      offset += len;

      if (KEYWORDS_SET.has(upper)) {
        // REM is special: rest of line is a comment
        if (upper === 'REM') {
          const commentText = input.substring(startOffset);
          tokens.push({
            type: TokenType.REM,
            category: TokenCategory.COMMENT,
            value: commentText,
            line: lineNumber,
            col: startOffset,
            start: startOffset,
            end: input.length,
          });
          offset = input.length;
          continue;
        }
        tokens.push({
          type: upper,
          category: classifyToken(upper),
          value: word,
          line: lineNumber,
          col: startOffset,
          start: startOffset,
          end: offset,
        });
      } else {
        tokens.push({
          type: TokenType.IDENTIFIER,
          category: TokenCategory.IDENTIFIER,
          value: word,
          line: lineNumber,
          col: startOffset,
          start: startOffset,
          end: offset,
        });
      }
      continue;
    }

    // Number literal
    if (isDigit(ch) || (ch === '.' && isDigit(peek(1)))) {
      let len = 0;
      let isFloat = false;

      // Check for 0b (binary), 0o (octal), 0x/0h (hex)
      if (ch === '0' && offset + 1 < input.length) {
        const next = input[offset + 1];
        if (next === 'b') {
          len = 2;
          while (offset + len < input.length && (input[offset + len] === '0' || input[offset + len] === '1' || input[offset + len] === '_')) len++;
          tokens.push({
            type: TokenType.INTEGER, category: TokenCategory.LITERAL,
            value: input.substring(offset, offset + len), line: lineNumber,
            col: startOffset, start: startOffset, end: offset + len,
          });
          offset += len;
          continue;
        } else if (next === 'o') {
          len = 2;
          while (offset + len < input.length && ((input[offset + len] >= '0' && input[offset + len] <= '7') || input[offset + len] === '_')) len++;
          tokens.push({
            type: TokenType.INTEGER, category: TokenCategory.LITERAL,
            value: input.substring(offset, offset + len), line: lineNumber,
            col: startOffset, start: startOffset, end: offset + len,
          });
          offset += len;
          continue;
        } else if (next === 'h' || next === 'x') {
          len = 2;
          while (offset + len < input.length && (isHexChar(input[offset + len]) || input[offset + len] === '_')) len++;
          tokens.push({
            type: TokenType.INTEGER, category: TokenCategory.LITERAL,
            value: input.substring(offset, offset + len), line: lineNumber,
            col: startOffset, start: startOffset, end: offset + len,
          });
          offset += len;
          continue;
        }
      }

      // Regular number
      while (offset + len < input.length && (isDigit(input[offset + len]) || input[offset + len] === '_')) len++;
      if (offset + len < input.length && input[offset + len] === '.') {
        len++;
        isFloat = true;
        while (offset + len < input.length && (isDigit(input[offset + len]) || input[offset + len] === '_')) len++;
      }
      if (offset + len < input.length && input[offset + len] === 'e') {
        const nextAfterE = input[offset + len + 1];
        if (nextAfterE === '-' || nextAfterE === '+' || isDigit(nextAfterE) || nextAfterE === '_') {
          isFloat = true;
          len++;
          if (input[offset + len] === '+' || input[offset + len] === '-') len++;
          while (offset + len < input.length && (isDigit(input[offset + len]) || input[offset + len] === '_')) len++;
        }
      }

      tokens.push({
        type: isFloat ? TokenType.FLOAT : TokenType.INTEGER,
        category: TokenCategory.LITERAL,
        value: input.substring(offset, offset + len),
        line: lineNumber,
        col: startOffset,
        start: startOffset,
        end: offset + len,
      });
      offset += len;
      continue;
    }

    // String literal
    if (ch === '"') {
      let len = 1;
      while (offset + len < input.length && input[offset + len] !== '"') {
        if (input[offset + len] === '\\') len++;
        if (offset + len < input.length) len++;
      }
      if (offset + len < input.length) len++; // closing quote
      tokens.push({
        type: TokenType.STRING,
        category: TokenCategory.STRING,
        value: input.substring(offset, offset + len),
        line: lineNumber,
        col: startOffset,
        start: startOffset,
        end: offset + len,
      });
      offset += len;
      continue;
    }

    // Operators and punctuation
    offset++;
    switch (ch) {
      case '?': tokens.push({ type: TokenType.QUESTION_MARK, category: TokenCategory.TYPE_SUFFIX, value: '?', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '$': tokens.push({ type: TokenType.DOLLAR, category: TokenCategory.TYPE_SUFFIX, value: '$', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '=': tokens.push({ type: TokenType.EQ, category: TokenCategory.OPERATOR, value: '=', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '>':
        if (peek(0) === '=') { offset++; tokens.push({ type: TokenType.GE, category: TokenCategory.OPERATOR, value: '>=', line: lineNumber, col: startOffset, start: startOffset, end: offset }); }
        else tokens.push({ type: TokenType.GT, category: TokenCategory.OPERATOR, value: '>', line: lineNumber, col: startOffset, start: startOffset, end: offset });
        break;
      case '<':
        if (peek(0) === '=') { offset++; tokens.push({ type: TokenType.LE, category: TokenCategory.OPERATOR, value: '<=', line: lineNumber, col: startOffset, start: startOffset, end: offset }); }
        else tokens.push({ type: TokenType.LT, category: TokenCategory.OPERATOR, value: '<', line: lineNumber, col: startOffset, start: startOffset, end: offset });
        break;
      case '^': tokens.push({ type: TokenType.CARET, category: TokenCategory.OPERATOR, value: '^', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '+': tokens.push({ type: TokenType.PLUS, category: TokenCategory.OPERATOR, value: '+', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '-': tokens.push({ type: TokenType.MINUS, category: TokenCategory.OPERATOR, value: '-', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '*': tokens.push({ type: TokenType.STAR, category: TokenCategory.OPERATOR, value: '*', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '/': tokens.push({ type: TokenType.SLASH, category: TokenCategory.OPERATOR, value: '/', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '%': tokens.push({ type: TokenType.PERCENT, category: TokenCategory.TYPE_SUFFIX, value: '%', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '!':
        if (peek(0) === '=') { offset++; tokens.push({ type: TokenType.NE, category: TokenCategory.OPERATOR, value: '!=', line: lineNumber, col: startOffset, start: startOffset, end: offset }); }
        break;
      case '.': tokens.push({ type: TokenType.DOT, category: TokenCategory.PUNCTUATION, value: '.', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case ':': tokens.push({ type: TokenType.COLON, category: TokenCategory.PUNCTUATION, value: ':', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case ',':
      case ';':
        tokens.push({ type: TokenType.COMMA, category: TokenCategory.PUNCTUATION, value: ch, line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case '(': tokens.push({ type: TokenType.BRAC_OPEN, category: TokenCategory.PUNCTUATION, value: '(', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      case ')': tokens.push({ type: TokenType.BRAC_CLOSE, category: TokenCategory.PUNCTUATION, value: ')', line: lineNumber, col: startOffset, start: startOffset, end: offset }); break;
      default:
        // Unknown character - skip
        break;
    }
  }

  return tokens;
}

/**
 * Tokenize a complete BASIC program (multi-line).
 * Returns { tokens: Token[][], allTokens: Token[], stats: {} }
 */
function tokenize(source) {
  const lines = source.split('\n');
  const tokensByLine = [];
  const allTokens = [];
  const stats = {
    totalTokens: 0,
    keywords: 0,
    identifiers: 0,
    literals: 0,
    operators: 0,
    strings: 0,
    comments: 0,
  };

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenizeLine(lines[i], i + 1);
    tokensByLine.push(lineTokens);
    for (const tok of lineTokens) {
      allTokens.push(tok);
      stats.totalTokens++;
      switch (tok.category) {
        case TokenCategory.KEYWORD: stats.keywords++; break;
        case TokenCategory.IDENTIFIER: stats.identifiers++; break;
        case TokenCategory.LITERAL: stats.literals++; break;
        case TokenCategory.OPERATOR: stats.operators++; break;
        case TokenCategory.STRING: stats.strings++; break;
        case TokenCategory.COMMENT: stats.comments++; break;
      }
    }
  }

  return { tokens: tokensByLine, allTokens, stats };
}

module.exports = { tokenize, tokenizeLine, TokenType, TokenCategory, MATH_FUNCTIONS, CONTROL_FLOW };
