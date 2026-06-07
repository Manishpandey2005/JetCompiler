/**
 * BASIC JIT — JavaScript Parser
 * Simplified recursive-descent parser ported from src/parser/parser.c
 * Produces a JSON AST for visualization purposes.
 */

const { tokenizeLine, TokenType, TokenCategory } = require('./lexer');

class ParseError extends Error {
  constructor(message, line, col) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

class Parser {
  constructor(tokens, lineNumber) {
    this.tokens = tokens.filter(t => t.type !== TokenType.REM); // Skip comments
    this.pos = 0;
    this.lineNumber = lineNumber;
  }

  peek() {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : { type: TokenType.EOF, value: '', col: -1 };
  }

  advance() {
    const tok = this.peek();
    this.pos++;
    return tok;
  }

  accept(type) {
    if (this.peek().type === type) {
      return this.advance();
    }
    return null;
  }

  expect(type) {
    const tok = this.accept(type);
    if (!tok) {
      const cur = this.peek();
      throw new ParseError(
        `Expected ${type}, got ${cur.type} ('${cur.value}')`,
        this.lineNumber,
        cur.col >= 0 ? cur.col : (this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].end : 0)
      );
    }
    return tok;
  }

  isAtEnd() {
    return this.pos >= this.tokens.length || this.peek().type === TokenType.EOF;
  }

  // ---- Expression parsing (operator precedence) ----

  parseExpression() {
    return this.parseOrExpr();
  }

  parseOrExpr() {
    let left = this.parseXorExpr();
    while (this.accept(TokenType.OR)) {
      const right = this.parseXorExpr();
      left = { type: 'BinaryOp', op: 'OR', left, right, line: this.lineNumber };
    }
    return left;
  }

  parseXorExpr() {
    let left = this.parseAndExpr();
    while (this.accept(TokenType.XOR)) {
      const right = this.parseAndExpr();
      left = { type: 'BinaryOp', op: 'XOR', left, right, line: this.lineNumber };
    }
    return left;
  }

  parseAndExpr() {
    let left = this.parseComparisonExpr();
    while (this.accept(TokenType.AND)) {
      const right = this.parseComparisonExpr();
      left = { type: 'BinaryOp', op: 'AND', left, right, line: this.lineNumber };
    }
    return left;
  }

  parseComparisonExpr() {
    let left = this.parseAdditiveExpr();
    const ops = { EQ: '=', LT: '<', GT: '>', LE: '<=', GE: '>=', NE: '!=' };
    while (true) {
      let matched = false;
      for (const [tokType, opSym] of Object.entries(ops)) {
        const tok = this.accept(tokType);
        if (tok) {
          const right = this.parseAdditiveExpr();
          left = { type: 'BinaryOp', op: opSym, left, right, line: this.lineNumber };
          matched = true;
          break;
        }
      }
      if (!matched) break;
    }
    return left;
  }

  parseAdditiveExpr() {
    let left = this.parseMultiplicativeExpr();
    while (true) {
      if (this.accept(TokenType.PLUS)) {
        const right = this.parseMultiplicativeExpr();
        left = { type: 'BinaryOp', op: '+', left, right, line: this.lineNumber };
      } else if (this.accept(TokenType.MINUS)) {
        const right = this.parseMultiplicativeExpr();
        left = { type: 'BinaryOp', op: '-', left, right, line: this.lineNumber };
      } else break;
    }
    return left;
  }

  parseMultiplicativeExpr() {
    let left = this.parsePowExpr();
    while (true) {
      if (this.accept(TokenType.STAR)) {
        const right = this.parsePowExpr();
        left = { type: 'BinaryOp', op: '*', left, right, line: this.lineNumber };
      } else if (this.accept(TokenType.SLASH)) {
        const right = this.parsePowExpr();
        left = { type: 'BinaryOp', op: '/', left, right, line: this.lineNumber };
      } else if (this.accept(TokenType.MOD)) {
        const right = this.parsePowExpr();
        left = { type: 'BinaryOp', op: 'MOD', left, right, line: this.lineNumber };
      } else break;
    }
    return left;
  }

  parsePowExpr() {
    let left = this.parseUnaryExpr();
    if (this.accept(TokenType.CARET)) {
      const right = this.parsePowExpr(); // right-associative
      return { type: 'BinaryOp', op: '^', left, right, line: this.lineNumber };
    }
    return left;
  }

  parseUnaryExpr() {
    // Unary functions
    const unaryFuncs = ['SIN','COS','TAN','ASN','ACS','ATN','LOG','LN','EXP','SQR',
                        'ABS','SGN','INT','FRAC','RND','DEG','RAD','VAL','STR',
                        'CHR','ASC','LEN','TAB','SPC','NOT'];
    for (const fn of unaryFuncs) {
      if (this.accept(fn)) {
        // Some functions accept optional $ suffix
        this.accept(TokenType.DOLLAR);
        const arg = this.parseBinaryFuncExpr();
        return { type: 'UnaryFunc', func: fn, arg, line: this.lineNumber };
      }
    }
    if (this.accept(TokenType.MINUS)) {
      const arg = this.parseBinaryFuncExpr();
      return { type: 'UnaryOp', op: 'NEG', arg, line: this.lineNumber };
    }
    return this.parseBinaryFuncExpr();
  }

  parseBinaryFuncExpr() {
    // LEFT$(...) and RIGHT$(...)
    for (const fn of ['LEFT', 'RIGHT']) {
      if (this.accept(fn)) {
        this.accept(TokenType.DOLLAR);
        this.expect(TokenType.BRAC_OPEN);
        const a = this.parseExpression();
        this.expect(TokenType.COMMA);
        const b = this.parseExpression();
        this.expect(TokenType.BRAC_CLOSE);
        return { type: 'BinaryFunc', func: fn, args: [a, b], line: this.lineNumber };
      }
    }
    return this.parsePrimaryExpr();
  }

  parsePrimaryExpr() {
    // FN call
    if (this.accept(TokenType.FN)) {
      const name = this.expect(TokenType.IDENTIFIER);
      // Optional type suffix
      this.accept(TokenType.DOLLAR) || this.accept(TokenType.PERCENT) || this.accept(TokenType.QUESTION_MARK) || this.accept(TokenType.DOT);
      this.expect(TokenType.BRAC_OPEN);
      const args = [];
      if (this.peek().type !== TokenType.BRAC_CLOSE) {
        args.push(this.parseExpression());
        while (this.accept(TokenType.COMMA)) {
          args.push(this.parseExpression());
        }
      }
      this.expect(TokenType.BRAC_CLOSE);
      return { type: 'FnCall', name: name.value, args, line: this.lineNumber };
    }

    // Integer literal
    const intTok = this.accept(TokenType.INTEGER);
    if (intTok) return { type: 'Integer', value: intTok.value, line: this.lineNumber };

    // Float literal
    const floatTok = this.accept(TokenType.FLOAT);
    if (floatTok) return { type: 'Float', value: floatTok.value, line: this.lineNumber };

    // String literal
    const strTok = this.accept(TokenType.STRING);
    if (strTok) return { type: 'String', value: strTok.value, line: this.lineNumber };

    // Boolean
    if (this.accept(TokenType.TRUE)) return { type: 'Boolean', value: true, line: this.lineNumber };
    if (this.accept(TokenType.FALSE)) return { type: 'Boolean', value: false, line: this.lineNumber };

    // RAN (random)
    if (this.accept(TokenType.RAN)) return { type: 'Ran', line: this.lineNumber };
    if (this.accept(TokenType.KEY)) return { type: 'Key', line: this.lineNumber };

    // Parenthesized expression
    if (this.accept(TokenType.BRAC_OPEN)) {
      const expr = this.parseExpression();
      this.expect(TokenType.BRAC_CLOSE);
      return expr;
    }

    // If expression (inline)
    if (this.accept(TokenType.IF)) {
      const cond = this.parseExpression();
      this.expect(TokenType.THEN);
      const ifTrue = this.parseExpression();
      this.expect(TokenType.ELSE);
      const ifFalse = this.parseExpression();
      return { type: 'IfExpr', condition: cond, ifTrue, ifFalse, line: this.lineNumber };
    }

    // Identifier (variable or array access)
    const idTok = this.accept(TokenType.IDENTIFIER);
    if (idTok) {
      let varType = 'undef';
      if (this.accept(TokenType.DOT)) varType = 'float';
      else if (this.accept(TokenType.DOLLAR)) varType = 'string';
      else if (this.accept(TokenType.PERCENT)) varType = 'int';
      else if (this.accept(TokenType.QUESTION_MARK)) varType = 'bool';

      // Array index
      if (this.accept(TokenType.BRAC_OPEN)) {
        const indices = [this.parseExpression()];
        while (this.accept(TokenType.COMMA)) {
          indices.push(this.parseExpression());
        }
        this.expect(TokenType.BRAC_CLOSE);
        return { type: 'ArrayAccess', name: idTok.value, varType, indices, line: this.lineNumber };
      }
      return { type: 'Variable', name: idTok.value, varType, line: this.lineNumber };
    }

    if (this.isAtEnd()) return null;

    const cur = this.peek();
    throw new ParseError(
      `Unexpected token '${cur.value}' (${cur.type})`,
      this.lineNumber,
      cur.col
    );
  }

  // ---- Statement parsing ----

  parseStatement() {
    if (this.isAtEnd()) return null;

    // Line number (label)
    const intTok = this.accept(TokenType.INTEGER);
    if (intTok) {
      const stmt = this.parseStatementBody();
      return { type: 'LineNumber', number: intTok.value, body: stmt, line: this.lineNumber };
    }

    // Label (identifier followed by colon)
    if (this.peek().type === TokenType.IDENTIFIER) {
      // Look ahead for colon
      const saved = this.pos;
      const id = this.advance();
      if (this.accept(TokenType.COLON)) {
        return { type: 'Label', name: id.value, line: this.lineNumber };
      }
      this.pos = saved; // backtrack
    }

    return this.parseStatementBody();
  }

  parseStatementBody() {
    if (this.isAtEnd()) return null;

    // PRINT
    if (this.accept(TokenType.PRINT)) {
      const values = [];
      let openEnd = false;
      while (!this.isAtEnd() && this.peek().type !== TokenType.COLON) {
        const expr = this.parseExpression();
        if (expr) values.push(expr);
        if (this.accept(TokenType.COMMA)) {
          openEnd = true;
        } else {
          openEnd = false;
          break;
        }
      }
      return { type: 'Print', values, openEnd, line: this.lineNumber };
    }

    // IF/THEN/ELSE
    if (this.accept(TokenType.IF)) {
      const condition = this.parseExpression();
      this.expect(TokenType.THEN);
      const ifTrue = this.parseMultipleStatements();
      let ifFalse = null;
      if (this.accept(TokenType.ELSE)) {
        ifFalse = this.parseMultipleStatements();
      }
      return { type: 'If', condition, ifTrue, ifFalse, line: this.lineNumber };
    }

    // FOR
    if (this.accept(TokenType.FOR)) {
      const varTok = this.expect(TokenType.IDENTIFIER);
      let varType = 'undef';
      if (this.accept(TokenType.PERCENT)) varType = 'int';
      else if (this.accept(TokenType.DOT)) varType = 'float';
      this.expect(TokenType.EQ);
      const start = this.parseExpression();
      this.expect(TokenType.TO);
      const end = this.parseExpression();
      let step = null;
      if (this.accept(TokenType.STEP)) {
        step = this.parseExpression();
      }
      return { type: 'For', variable: varTok.value, varType, start, end, step, line: this.lineNumber };
    }

    // NEXT
    if (this.accept(TokenType.NEXT)) {
      const varTok = this.expect(TokenType.IDENTIFIER);
      this.accept(TokenType.PERCENT) || this.accept(TokenType.DOT);
      return { type: 'Next', variable: varTok.value, line: this.lineNumber };
    }

    // GOTO
    if (this.accept(TokenType.GOTO)) {
      const target = this.peek().type === TokenType.INTEGER ? this.advance() : this.expect(TokenType.IDENTIFIER);
      return { type: 'GoTo', target: target.value, line: this.lineNumber };
    }

    // GOSUB
    if (this.accept(TokenType.GOSUB)) {
      const target = this.peek().type === TokenType.INTEGER ? this.advance() : this.expect(TokenType.IDENTIFIER);
      return { type: 'GoSub', target: target.value, line: this.lineNumber };
    }

    // RETURN
    if (this.accept(TokenType.RETURN)) {
      return { type: 'Return', line: this.lineNumber };
    }

    // DEF FN
    if (this.accept(TokenType.DEF)) {
      this.expect(TokenType.FN);
      const name = this.expect(TokenType.IDENTIFIER);
      this.accept(TokenType.DOLLAR) || this.accept(TokenType.PERCENT) || this.accept(TokenType.QUESTION_MARK) || this.accept(TokenType.DOT);
      this.expect(TokenType.BRAC_OPEN);
      const params = [];
      if (this.peek().type === TokenType.IDENTIFIER) {
        const p = this.advance();
        this.accept(TokenType.DOLLAR) || this.accept(TokenType.PERCENT) || this.accept(TokenType.QUESTION_MARK) || this.accept(TokenType.DOT);
        params.push(p.value);
        while (this.accept(TokenType.COMMA)) {
          const p2 = this.expect(TokenType.IDENTIFIER);
          this.accept(TokenType.DOLLAR) || this.accept(TokenType.PERCENT) || this.accept(TokenType.QUESTION_MARK) || this.accept(TokenType.DOT);
          params.push(p2.value);
        }
      }
      this.expect(TokenType.BRAC_CLOSE);
      this.expect(TokenType.EQ);
      const body = this.parseExpression();
      return { type: 'DefFn', name: name.value, params, body, line: this.lineNumber };
    }

    // DATA
    if (this.accept(TokenType.DATA)) {
      const values = [];
      do {
        const expr = this.parseExpression();
        if (expr) values.push(expr);
      } while (this.accept(TokenType.COMMA));
      return { type: 'Data', values, line: this.lineNumber };
    }

    // READ
    if (this.accept(TokenType.READ)) {
      const vars = [];
      do {
        const v = this.expect(TokenType.IDENTIFIER);
        let vt = 'undef';
        if (this.accept(TokenType.PERCENT)) vt = 'int';
        else if (this.accept(TokenType.DOLLAR)) vt = 'string';
        else if (this.accept(TokenType.DOT)) vt = 'float';
        else if (this.accept(TokenType.QUESTION_MARK)) vt = 'bool';
        vars.push({ name: v.value, varType: vt });
      } while (this.accept(TokenType.COMMA));
      return { type: 'Read', variables: vars, line: this.lineNumber };
    }

    // DIM
    if (this.accept(TokenType.DIM)) {
      const name = this.expect(TokenType.IDENTIFIER);
      let varType = 'undef';
      if (this.accept(TokenType.PERCENT)) varType = 'int';
      else if (this.accept(TokenType.DOLLAR)) varType = 'string';
      else if (this.accept(TokenType.DOT)) varType = 'float';
      else if (this.accept(TokenType.QUESTION_MARK)) varType = 'bool';
      this.expect(TokenType.BRAC_OPEN);
      const dims = [this.parseExpression()];
      while (this.accept(TokenType.COMMA)) dims.push(this.parseExpression());
      this.expect(TokenType.BRAC_CLOSE);
      return { type: 'Dim', name: name.value, varType, dimensions: dims, line: this.lineNumber };
    }

    // INPUT
    if (this.accept(TokenType.INPUT)) {
      let prompt = null;
      if (this.peek().type === TokenType.STRING) {
        prompt = this.advance().value;
        this.accept(TokenType.COMMA);
      }
      const varTok = this.expect(TokenType.IDENTIFIER);
      let varType = 'undef';
      if (this.accept(TokenType.PERCENT)) varType = 'int';
      else if (this.accept(TokenType.DOLLAR)) varType = 'string';
      return { type: 'Input', prompt, variable: varTok.value, varType, line: this.lineNumber };
    }

    // END
    if (this.accept(TokenType.END)) {
      let exitCode = null;
      if (!this.isAtEnd() && this.peek().type !== TokenType.COLON) {
        try { exitCode = this.parseExpression(); } catch (e) { /* optional */ }
      }
      return { type: 'End', exitCode, line: this.lineNumber };
    }

    // STOP
    if (this.accept(TokenType.STOP)) {
      return { type: 'Stop', line: this.lineNumber };
    }

    // SLEEP
    if (this.accept(TokenType.SLEEP)) {
      const duration = this.parseExpression();
      return { type: 'Sleep', duration, line: this.lineNumber };
    }

    // ASSERT
    if (this.accept(TokenType.ASSERT)) {
      const expr = this.parseExpression();
      return { type: 'Assert', expression: expr, line: this.lineNumber };
    }

    // RESTORE
    if (this.accept(TokenType.RESTORE)) {
      let target = null;
      if (!this.isAtEnd() && this.peek().type !== TokenType.COLON) {
        if (this.peek().type === TokenType.INTEGER) target = this.advance().value;
        else if (this.peek().type === TokenType.IDENTIFIER) target = this.advance().value;
      }
      return { type: 'Restore', target, line: this.lineNumber };
    }

    // ON ... GOTO / GOSUB
    if (this.accept(TokenType.ON)) {
      const expr = this.parseExpression();
      const isGosub = !!this.accept(TokenType.GOSUB);
      if (!isGosub) this.expect(TokenType.GOTO);
      const targets = [];
      do {
        if (this.peek().type === TokenType.INTEGER) targets.push(this.advance().value);
        else targets.push(this.expect(TokenType.IDENTIFIER).value);
      } while (this.accept(TokenType.COMMA));
      return { type: isGosub ? 'OnGoSub' : 'OnGoTo', expression: expr, targets, line: this.lineNumber };
    }

    // LET (explicit or implicit assignment)
    const isLet = !!this.accept(TokenType.LET);
    if (isLet || this.peek().type === TokenType.IDENTIFIER) {
      const saved = this.pos;
      try {
        const id = this.expect(TokenType.IDENTIFIER);
        let varType = 'undef';
        if (this.accept(TokenType.DOT)) varType = 'float';
        else if (this.accept(TokenType.DOLLAR)) varType = 'string';
        else if (this.accept(TokenType.PERCENT)) varType = 'int';
        else if (this.accept(TokenType.QUESTION_MARK)) varType = 'bool';

        // Array assignment
        if (this.accept(TokenType.BRAC_OPEN)) {
          const indices = [this.parseExpression()];
          while (this.accept(TokenType.COMMA)) indices.push(this.parseExpression());
          this.expect(TokenType.BRAC_CLOSE);
          this.expect(TokenType.EQ);
          const value = this.parseExpression();
          return { type: 'Let', name: id.value, varType, indices, value, line: this.lineNumber };
        }

        this.expect(TokenType.EQ);
        const value = this.parseExpression();
        return { type: 'Let', name: id.value, varType, value, line: this.lineNumber };
      } catch (e) {
        if (isLet) throw e;
        this.pos = saved;
        // Fall through to expression evaluation
      }
    }

    // Standalone expression
    const expr = this.parseExpression();
    if (expr) return expr;

    return null;
  }

  parseMultipleStatements() {
    const stmts = [];
    const stmt = this.parseStatementBody();
    if (stmt) stmts.push(stmt);
    while (this.accept(TokenType.COLON)) {
      const s = this.parseStatementBody();
      if (s) stmts.push(s);
    }
    return stmts.length === 1 ? stmts[0] : { type: 'Multiple', statements: stmts, line: this.lineNumber };
  }
}

/**
 * Parse a complete BASIC program.
 * Returns { ast: ASTNode, errors: ParseError[] }
 */
function parse(source) {
  const lines = source.split('\n');
  const body = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const tokens = tokenizeLine(line, i + 1);
    if (tokens.length === 0) continue;

    // Skip pure comment lines
    if (tokens.length === 1 && tokens[0].type === TokenType.REM) {
      body.push({ type: 'Comment', text: tokens[0].value, line: i + 1 });
      continue;
    }

    const parser = new Parser(tokens, i + 1);
    try {
      // Parse multiple statements per line (separated by colons)
      const stmts = [];
      while (!parser.isAtEnd()) {
        const stmt = parser.parseStatement();
        if (stmt) stmts.push(stmt);
        parser.accept(TokenType.COLON);
        if (parser.isAtEnd()) break;
      }

      if (stmts.length === 1) {
        body.push(stmts[0]);
      } else if (stmts.length > 1) {
        body.push({ type: 'Multiple', statements: stmts, line: i + 1 });
      }
    } catch (e) {
      if (e instanceof ParseError) {
        errors.push({
          message: e.message,
          line: e.line,
          col: e.col,
          phase: 'parser',
        });
        body.push({ type: 'Error', message: e.message, line: i + 1, col: e.col });
      } else {
        errors.push({
          message: e.message || 'Unknown error',
          line: i + 1,
          col: 0,
          phase: 'parser',
        });
        body.push({ type: 'Error', message: e.message, line: i + 1, col: 0 });
      }
    }
  }

  return {
    ast: { type: 'Program', body, lineCount: lines.length },
    errors,
  };
}

module.exports = { parse, ParseError };
