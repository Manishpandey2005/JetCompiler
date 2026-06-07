/**
 * BASIC JIT Compiler Studio — Express Server
 * Bridges the JS lexer/parser (visualization) with the real C binary (execution).
 */

const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { tokenize } = require('./compiler/lexer');
const { parse } = require('./compiler/parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to the basicjit binary
const BASICJIT_PATH = process.env.BASICJIT_PATH ||
  path.resolve(__dirname, '..', 'build', 'release', 'bin', 'basicjit');

// Verify binary exists on startup
if (!fs.existsSync(BASICJIT_PATH)) {
  console.error(`⚠  basicjit binary not found at ${BASICJIT_PATH}`);
  console.error('   Build it first: make BUILD=release');
  console.error('   Or set BASICJIT_PATH env variable.');
  // Don't exit — allow tokenize/parse to work without the binary
}

// Middleware
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ─── Example Programs ────────────────────────────────────────────

const EXAMPLES = {
  'hello_world': {
    name: 'Hello World',
    description: 'Classic first program',
    code: `Print "Hello, World!"\nPrint "Welcome to BASIC JIT Compiler Studio!"`,
  },
  'variables': {
    name: 'Variables & Types',
    description: 'Integer, float, string, and boolean variables',
    code: `Rem === Variable Types ===
name$ = "BASIC"
age% = 30
pi = 3.14159
isReady? = True

Print "Language: "; name$
Print "Version: "; age
Print "Pi: "; pi
Print "Ready: "; isReady`,
  },
  'arithmetic': {
    name: 'Arithmetic',
    description: 'Math operations and built-in functions',
    code: `Rem === Arithmetic Demo ===
A% = 42
B% = 13

Print "42 + 13 = "; A + B
Print "42 - 13 = "; A - B
Print "42 * 13 = "; A * B
Print "42 / 13 = "; A / B
Print "42 Mod 13 = "; A Mod B
Print "2 ^ 10 = "; 2 ^ 10
Print ""
Print "Sqr(144) = "; Sqr(144)
Print "Abs(-99) = "; Abs(-99)
Print "Sin(1.57) = "; Sin(1.57)`,
  },
  'loops': {
    name: 'Loops & Control Flow',
    description: 'FOR loops, IF/THEN/ELSE, and GOTO',
    code: `Rem === Loops Demo ===
Print "Counting 1-5: ";
For I = 1 To 5
    Print I; " ";
Next I
Print ""

Print "Even numbers: ";
For I = 2 To 10 Step 2
    Print I; " ";
Next I
Print ""

Print "Countdown: ";
For I = 5 To 1 Step -1
    Print I; " ";
Next I
Print "Go!"

Rem IF/THEN/ELSE
score% = 85
If score >= 90 Then Print "Grade: A" Else If score >= 80 Then Print "Grade: B" Else Print "Grade: C"`,
  },
  'strings': {
    name: 'String Functions',
    description: 'Built-in string manipulation',
    code: `Rem === String Functions ===
Print "Len('Hello') = "; Len("Hello")
Print "Left('Hello', 3) = "; Left("Hello", 3)
Print "Right('Hello', 3) = "; Right("Hello", 3)
Print "Asc('A') = "; Asc("A")
Print "Chr(90) = "; Chr(90)
Print "Concatenation: "; "Hi" + " " + "there!"`,
  },
  'functions': {
    name: 'User-Defined Functions',
    description: 'DEF FN with recursion (Fibonacci)',
    code: `Rem === User Functions ===
Def Fn double(X) = X * 2
Print "double(7) = "; Fn double(7)

Def Fn add(X, Y) = X + Y
Print "add(3, 4) = "; Fn add(3, 4)

Rem Recursive Fibonacci
Def Fn fib%(N%) = (If N <= 1 Then N Else Fn fib(N - 1) + Fn fib(N - 2))
Print "fib(10) = "; Fn fib(10)
Print "fib(15) = "; Fn fib(15)`,
  },
  'boolean_logic': {
    name: 'Boolean Logic',
    description: 'AND, OR, NOT, XOR operations',
    code: `Rem === Boolean Logic ===
P? = True
Q? = False

Print "True And False = "; P And Q
Print "True Or  False = "; P Or Q
Print "Not True       = "; Not P
Print "True Xor False = "; P Xor Q
Print "True Xor True  = "; P Xor P`,
  },
  'subroutines': {
    name: 'Subroutines & Data',
    description: 'GOSUB/RETURN, DATA/READ',
    code: `Rem === Subroutines & Data ===
Print "Before subroutine"
GoSub greet
Print "After subroutine"
GoTo skipData

greet:
    Print "  >> Hello from subroutine!"
Return

skipData:

Rem DATA / READ
Data 10, 20, 30, 40, 50
Read A%, B%, C%, D%, E%
Print "Data: "; A; " "; B; " "; C; " "; D; " "; E`,
  },
  'full_demo': {
    name: 'Full Demo',
    description: 'Comprehensive feature showcase',
    code: fs.existsSync(path.resolve(__dirname, '..', 'demo_features.basic'))
      ? fs.readFileSync(path.resolve(__dirname, '..', 'demo_features.basic'), 'utf-8')
      : 'Print "demo_features.basic not found"',
  },
};

// ─── API: Get Examples ───────────────────────────────────────────

app.get('/api/examples', (req, res) => {
  const list = Object.entries(EXAMPLES).map(([id, ex]) => ({
    id, name: ex.name, description: ex.description,
  }));
  res.json({ examples: list });
});

app.get('/api/examples/:id', (req, res) => {
  const ex = EXAMPLES[req.params.id];
  if (!ex) return res.status(404).json({ error: 'Example not found' });
  res.json(ex);
});

// ─── API: Tokenize Only (for live feedback) ─────────────────────

app.post('/api/tokenize', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No code provided' });
  }
  try {
    const result = tokenize(code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Full Compile Pipeline ─────────────────────────────────

app.post('/api/compile', (req, res) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'No code provided' });
  }

  if (code.length > 100000) {
    return res.status(400).json({ error: 'Code too large (max 100KB)' });
  }

  const startTime = Date.now();

  // Phase 1: Lexical Analysis (JS)
  let tokenResult;
  try {
    tokenResult = tokenize(code);
  } catch (err) {
    return res.json({
      tokens: null,
      ast: null,
      output: '',
      error: {
        phase: 'lexer',
        message: err.message,
        line: 0,
        column: 0,
      },
      executionTime: Date.now() - startTime,
      phases: { lexer: 'error', parser: 'skipped', codegen: 'skipped', execution: 'skipped' },
    });
  }

  // Phase 2: Parsing (JS)
  let parseResult;
  try {
    parseResult = parse(code);
  } catch (err) {
    return res.json({
      tokens: tokenResult,
      ast: null,
      output: '',
      error: {
        phase: 'parser',
        message: err.message,
        line: 0,
        column: 0,
      },
      executionTime: Date.now() - startTime,
      phases: { lexer: 'done', parser: 'error', codegen: 'skipped', execution: 'skipped' },
    });
  }

  // Check if JS parser found errors
  if (parseResult.errors.length > 0) {
    // Still continue to C binary — it may succeed or give a better error
  }

  // Phase 3 & 4: Code Generation + Execution (C binary)
  if (!fs.existsSync(BASICJIT_PATH)) {
    return res.json({
      tokens: tokenResult,
      ast: parseResult,
      output: '',
      error: {
        phase: 'codegen',
        message: 'BASIC JIT binary not found. Please build with: make BUILD=release',
        line: 0,
        column: 0,
      },
      executionTime: Date.now() - startTime,
      phases: { lexer: 'done', parser: 'done', codegen: 'error', execution: 'skipped' },
    });
  }

  // Write code to temp file
  const tmpFile = path.join(
    os.tmpdir(),
    `basicjit_${Date.now()}_${Math.random().toString(36).slice(2)}.basic`
  );

  try {
    // C parser requires trailing newline — without it, the last line is silently skipped
    const codeWithNewline = code.endsWith('\n') ? code : code + '\n';
    fs.writeFileSync(tmpFile, codeWithNewline, 'utf-8');
  } catch (err) {
    return res.json({
      tokens: tokenResult,
      ast: parseResult,
      output: '',
      error: { phase: 'codegen', message: 'Failed to create temp file: ' + err.message, line: 0, column: 0 },
      executionTime: Date.now() - startTime,
      phases: { lexer: 'done', parser: 'done', codegen: 'error', execution: 'skipped' },
    });
  }

  // Execute the C binary
  const execStart = Date.now();
  execFile(BASICJIT_PATH, [tmpFile], {
    timeout: 10000,
    maxBuffer: 5 * 1024 * 1024,
    encoding: 'utf-8',
  }, (err, stdout, stderr) => {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch { }

    const execTime = Date.now() - execStart;
    const totalTime = Date.now() - startTime;

    // Check for errors - either from execFile err or from stderr content
    const hasError = err || (stderr && stderr.trim().length > 0);

    if (hasError) {
      const errorText = (stderr && stderr.trim()) || (err && err.message) || 'Unknown error';
      const errorInfo = classifyError(errorText, code);

      if (err && err.killed) {
        errorInfo.phase = 'execution';
        errorInfo.message = 'Execution timed out (10s limit)';
      }

      return res.json({
        tokens: tokenResult,
        ast: parseResult,
        output: stdout || '',
        error: errorInfo,
        executionTime: totalTime,
        execTime,
        phases: {
          lexer: 'done',
          parser: errorInfo.phase === 'parser' ? 'error' : 'done',
          codegen: errorInfo.phase === 'codegen' ? 'error' : (errorInfo.phase === 'parser' ? 'skipped' : 'done'),
          execution: (errorInfo.phase === 'parser' || errorInfo.phase === 'codegen') ? 'skipped' : 'error',
        },
      });
    }

    // Success
    res.json({
      tokens: tokenResult,
      ast: parseResult,
      output: stdout || '',
      error: null,
      executionTime: totalTime,
      execTime,
      phases: { lexer: 'done', parser: 'done', codegen: 'done', execution: 'done' },
    });
  });
});

// ─── Error Classification ────────────────────────────────────────

function classifyError(stderr, code) {
  const lines = code.split('\n');
  const info = {
    phase: 'execution',
    message: stderr.trim(),
    line: 0,
    column: 0,
    sourceLine: '',
  };

  // Syntax error from parser: "error: Syntax error at file:line:col"
  const syntaxMatch = stderr.match(/Syntax error at [^:]+:(\d+):(\d+)/);
  if (syntaxMatch) {
    info.phase = 'parser';
    info.line = parseInt(syntaxMatch[1]);
    info.column = parseInt(syntaxMatch[2]);
    info.message = `Syntax error at line ${info.line}, column ${info.column}`;
    if (info.line > 0 && info.line <= lines.length) {
      info.sourceLine = lines[info.line - 1];
    }
    return info;
  }

  // Codegen errors: "error: <ErrorName> at file:line"
  const codegenMatch = stderr.match(/error: (.+) at [^:]+:(\d+)/);
  if (codegenMatch) {
    info.phase = 'codegen';
    info.message = codegenMatch[1];
    info.line = parseInt(codegenMatch[2]);
    if (info.line > 0 && info.line <= lines.length) {
      info.sourceLine = lines[info.line - 1];
    }
    return info;
  }

  // Unresolved label: "error: Unresolved label <name> at line <num>"
  const labelMatch = stderr.match(/Unresolved label (.+) at line (\d+)/);
  if (labelMatch) {
    info.phase = 'codegen';
    info.message = `Unresolved label '${labelMatch[1]}'`;
    info.line = parseInt(labelMatch[2]);
    if (info.line > 0 && info.line <= lines.length) {
      info.sourceLine = lines[info.line - 1];
    }
    return info;
  }

  // Runtime signal errors
  const signalMatch = stderr.match(/Child terminated: (.+)/);
  if (signalMatch) {
    info.phase = 'execution';
    info.message = `Runtime error: ${signalMatch[1]}`;
    return info;
  }

  // Memory error
  if (stderr.includes('Failed to set memory protection') || stderr.includes('Failed to fork')) {
    info.phase = 'execution';
    info.message = 'System error: ' + stderr.trim();
    return info;
  }

  return info;
}

// ─── Health Check ────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    binaryAvailable: fs.existsSync(BASICJIT_PATH),
    binaryPath: BASICJIT_PATH,
    uptime: process.uptime(),
  });
});

// ─── SPA Fallback ────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ BASIC JIT Compiler Studio');
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → Binary: ${fs.existsSync(BASICJIT_PATH) ? '✓ Found' : '✗ Not found'}`);
  console.log('');
});
