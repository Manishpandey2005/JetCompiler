/**
 * BASIC JIT Compiler Studio — Frontend Application
 * Monaco Editor + Compiler Pipeline Visualization + Error Popups
 */

// ═══════════════════════════════════════════════════════════════
// Global State
// ═══════════════════════════════════════════════════════════════

let editor = null;
let isRunning = false;
let lastResult = null;

const DEFAULT_CODE = `Rem ==============================
Rem   Welcome to BASIC JIT Studio!
Rem ==============================

Print "Hello, World!"
Print ""

Rem --- Variables ---
name$ = "BASIC"
age% = 30
pi = 3.14159

Print "Language: "; name$
Print "Version: "; age
Print "Pi: "; pi
Print ""

Rem --- Loop ---
Print "Squares: ";
For I = 1 To 5
    Print I * I; " ";
Next I
Print ""

Rem --- Function ---
Def Fn double(X) = X * 2
Print "double(7) = "; Fn double(7)

Print ""
Print "=== Compilation Successful ==="`;

// ═══════════════════════════════════════════════════════════════
// Monaco Editor Setup
// ═══════════════════════════════════════════════════════════════

function initMonaco() {
  require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
  });

  require(['vs/editor/editor.main'], function () {
    // Register BASIC language
    monaco.languages.register({ id: 'basic' });

    monaco.languages.setMonarchTokensProvider('basic', {
      ignoreCase: true,
      keywords: [
        'PRINT', 'IF', 'THEN', 'ELSE', 'FOR', 'TO', 'STEP', 'NEXT',
        'GOTO', 'GOSUB', 'RETURN', 'LET', 'DIM', 'DATA', 'READ',
        'DEF', 'FN', 'END', 'STOP', 'RUN', 'NEW', 'INPUT', 'ON',
        'RESTORE', 'SLEEP', 'ASSERT', 'LOAD', 'SAVE', 'LIST', 'EDIT',
      ],
      operators: [
        'AND', 'OR', 'XOR', 'NOT', 'MOD',
      ],
      builtins: [
        'SIN', 'COS', 'TAN', 'ASN', 'ACS', 'ATN', 'LOG', 'LN', 'EXP',
        'SQR', 'ABS', 'SGN', 'INT', 'FRAC', 'RND', 'DEG', 'RAD',
        'VAL', 'STR', 'CHR', 'ASC', 'LEN', 'LEFT', 'RIGHT',
        'TAB', 'SPC', 'KEY', 'RAN', 'BEEP',
      ],
      booleans: ['TRUE', 'FALSE'],
      tokenizer: {
        root: [
          [/Rem\b.*$/, 'comment'],
          [/"[^"]*"/, 'string'],
          [/\b\d+\.?\d*([eE][+-]?\d+)?\b/, 'number'],
          [/\.\d+([eE][+-]?\d+)?/, 'number'],
          [/[a-zA-Z_]\w*[$%?]?/, {
            cases: {
              '@keywords': 'keyword',
              '@operators': 'keyword.operator',
              '@builtins': 'keyword.builtin',
              '@booleans': 'constant.language',
              '@default': 'identifier',
            }
          }],
          [/[>=<!]=?/, 'operator'],
          [/[+\-*/^]/, 'operator'],
          [/[;:,()]/, 'delimiter'],
          [/[$%?]/, 'type'],
        ]
      }
    });

    // Define dark theme
    monaco.editor.defineTheme('basic-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c792ea', fontStyle: 'bold' },
        { token: 'keyword.operator', foreground: '89ddff' },
        { token: 'keyword.builtin', foreground: '82aaff' },
        { token: 'constant.language', foreground: 'f78c6c' },
        { token: 'string', foreground: 'c3e88d' },
        { token: 'number', foreground: 'f78c6c' },
        { token: 'identifier', foreground: 'e2e4f0' },
        { token: 'operator', foreground: '89ddff' },
        { token: 'delimiter', foreground: '89ddff' },
        { token: 'type', foreground: 'ffcb6b' },
      ],
      colors: {
        'editor.background': '#0a0b0f',
        'editor.foreground': '#e2e4f0',
        'editor.lineHighlightBackground': '#1a1b2640',
        'editor.selectionBackground': '#8b5cf630',
        'editor.inactiveSelectionBackground': '#8b5cf615',
        'editorCursor.foreground': '#8b5cf6',
        'editorLineNumber.foreground': '#3a3c4e',
        'editorLineNumber.activeForeground': '#8b8fa3',
        'editor.selectionHighlightBackground': '#8b5cf620',
        'editorIndentGuide.background': '#1e1f2e',
        'editorIndentGuide.activeBackground': '#2a2b3d',
        'editorWidget.background': '#12131a',
        'editorWidget.border': '#1e1f2e',
        'editorSuggestWidget.background': '#12131a',
        'minimap.background': '#0a0b0f',
      }
    });

    // Create editor
    editor = monaco.editor.create(document.getElementById('monaco-editor'), {
      value: DEFAULT_CODE,
      language: 'basic',
      theme: 'basic-dark',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
      lineHeight: 22,
      padding: { top: 12, bottom: 12 },
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      bracketPairColorization: { enabled: true },
      automaticLayout: true,
      tabSize: 4,
      wordWrap: 'off',
      glyphMargin: false,
      folding: false,
      lineNumbersMinChars: 3,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
    });

    // Keybinding: Ctrl+Enter to run
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runCode();
    });

    // Focus editor
    editor.focus();
  });
}

// ═══════════════════════════════════════════════════════════════
// Compile & Run
// ═══════════════════════════════════════════════════════════════

async function runCode() {
  if (isRunning || !editor) return;

  const code = editor.getValue().trim();
  if (!code) {
    showToast('Please enter some BASIC code first.', 'info');
    return;
  }

  isRunning = true;
  const runBtn = document.getElementById('run-btn');
  runBtn.classList.add('running');
  runBtn.innerHTML = `<span>Compiling...</span>`;

  // Reset pipeline
  resetPipeline();

  // Phase 1: Lexer — start
  setPhaseState('lexer', 'running', 'Analyzing...');

  try {
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const result = await response.json();
    lastResult = result;

    // Animate pipeline phases
    await animatePipeline(result);

    // Render outputs
    renderOutput(result);
    renderTokens(result.tokens);
    renderAST(result.ast);

    // Update execution time
    if (result.executionTime) {
      document.getElementById('exec-time').textContent = `${result.executionTime}ms`;
    }

    // Show error popup if there's an error
    if (result.error) {
      showErrorModal(result.error);
    }

  } catch (err) {
    showToast('Failed to connect to server: ' + err.message, 'error');
    setPhaseState('lexer', 'error', 'Failed');
  } finally {
    isRunning = false;
    runBtn.classList.remove('running');
    runBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
      Run
      <kbd>Ctrl+Enter</kbd>
    `;
  }
}

// ═══════════════════════════════════════════════════════════════
// Pipeline Animation
// ═══════════════════════════════════════════════════════════════

function resetPipeline() {
  ['lexer', 'parser', 'codegen', 'execution'].forEach(phase => {
    setPhaseState(phase, 'ready', 'Ready');
  });
  document.querySelectorAll('.pipeline-connector').forEach(c => c.classList.remove('active'));
}

function setPhaseState(phase, state, statusText) {
  const el = document.getElementById(`phase-${phase}`);
  if (!el) return;
  el.setAttribute('data-state', state);
  const statusEl = el.querySelector('.phase-status');
  if (statusEl) statusEl.textContent = statusText || state;
}

async function animatePipeline(result) {
  const phases = result.phases || {};
  const connectors = document.querySelectorAll('.pipeline-connector');
  const delay = (ms) => new Promise(r => setTimeout(r, ms));

  // Phase 1: Lexer
  setPhaseState('lexer', 'running', 'Analyzing...');
  await delay(200);
  if (phases.lexer === 'error') {
    setPhaseState('lexer', 'error', 'Error');
    return;
  }
  setPhaseState('lexer', 'done', 'Complete');
  if (connectors[0]) connectors[0].classList.add('active');

  // Phase 2: Parser
  setPhaseState('parser', 'running', 'Parsing...');
  await delay(200);
  if (phases.parser === 'error') {
    setPhaseState('parser', 'error', 'Error');
    return;
  }
  setPhaseState('parser', 'done', 'Complete');
  if (connectors[1]) connectors[1].classList.add('active');

  // Phase 3: CodeGen
  setPhaseState('codegen', 'running', 'Generating...');
  await delay(200);
  if (phases.codegen === 'error') {
    setPhaseState('codegen', 'error', 'Error');
    return;
  }
  if (phases.codegen === 'skipped') {
    setPhaseState('codegen', 'skipped', 'Skipped');
    return;
  }
  setPhaseState('codegen', 'done', 'Complete');
  if (connectors[2]) connectors[2].classList.add('active');

  // Phase 4: Execution
  setPhaseState('execution', 'running', 'Executing...');
  await delay(150);
  if (phases.execution === 'error') {
    setPhaseState('execution', 'error', 'Error');
    return;
  }
  if (phases.execution === 'skipped') {
    setPhaseState('execution', 'skipped', 'Skipped');
    return;
  }
  setPhaseState('execution', 'done', 'Complete');
}

// ═══════════════════════════════════════════════════════════════
// Output Rendering
// ═══════════════════════════════════════════════════════════════

function renderOutput(result) {
  const terminal = document.getElementById('output-terminal');

  if (result.error && !result.output) {
    terminal.innerHTML = `<div class="terminal-error">
      <span style="color:var(--error);">Error (${result.error.phase} phase):</span>
      <span>${escapeHtml(result.error.message)}</span>
    </div>`;
    return;
  }

  if (result.output) {
    const lines = result.output.split('\n');
    let html = '';
    for (const line of lines) {
      html += `<div class="output-line">${escapeHtml(line)}</div>`;
    }
    if (result.error) {
      html += `\n<div style="color:var(--error); margin-top:8px; padding-top:8px; border-top:1px solid var(--glass-border);">
        ⚠ ${escapeHtml(result.error.phase)} error: ${escapeHtml(result.error.message)}
      </div>`;
    }
    terminal.innerHTML = html;
  } else {
    terminal.innerHTML = '<div style="color:var(--text-dimmed);">(No output)</div>';
  }

  // Switch to output tab
  switchTab('output');
}

// ═══════════════════════════════════════════════════════════════
// Token Visualization
// ═══════════════════════════════════════════════════════════════

function renderTokens(tokenResult) {
  const container = document.getElementById('tokens-container');
  if (!tokenResult || !tokenResult.tokens) {
    container.innerHTML = '<div class="terminal-placeholder"><p>No token data available.</p></div>';
    return;
  }

  let html = '';

  // Stats bar
  const stats = tokenResult.stats;
  if (stats) {
    html += `<div class="token-stats">
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-keyword)"></span> Keywords: ${stats.keywords}</div>
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-identifier)"></span> Identifiers: ${stats.identifiers}</div>
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-number)"></span> Literals: ${stats.literals}</div>
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-string)"></span> Strings: ${stats.strings}</div>
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-operator)"></span> Operators: ${stats.operators}</div>
      <div class="stat-item"><span class="stat-dot" style="background:var(--token-comment)"></span> Comments: ${stats.comments}</div>
      <div class="stat-item"><strong>Total: ${stats.totalTokens}</strong></div>
    </div>`;
  }

  // Token lines
  const tokens = tokenResult.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const lineTokens = tokens[i];
    if (lineTokens.length === 0) continue;

    html += `<div class="token-line">`;
    html += `<div class="token-line-header">Line ${i + 1}</div>`;
    html += `<div class="token-line-tokens">`;

    for (const tok of lineTokens) {
      html += `<span class="token-pill" data-category="${tok.category}" title="${tok.type}: ${escapeHtml(tok.value)}">
        <span class="token-type-label">${tok.type}</span>
        ${escapeHtml(tok.value)}
      </span>`;
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Update tab badge
  const badge = document.getElementById('token-count');
  if (badge && stats) {
    badge.textContent = stats.totalTokens;
  }
}

// ═══════════════════════════════════════════════════════════════
// AST Visualization
// ═══════════════════════════════════════════════════════════════

function renderAST(parseResult) {
  const container = document.getElementById('ast-container');
  if (!parseResult || !parseResult.ast) {
    container.innerHTML = '<div class="terminal-placeholder"><p>No AST data available.</p></div>';
    return;
  }

  const ast = parseResult.ast;
  container.innerHTML = renderASTNode(ast, 0);

  // Add toggle handlers
  container.querySelectorAll('.ast-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      const node = e.target.closest('.ast-node');
      if (node) node.classList.toggle('collapsed');
    });
  });
}

function renderASTNode(node, depth) {
  if (!node) return '';
  if (typeof node !== 'object') return `<span class="ast-node-value">${escapeHtml(String(node))}</span>`;

  if (Array.isArray(node)) {
    return node.map(n => renderASTNode(n, depth)).join('');
  }

  const type = node.type || 'Unknown';
  const hasChildren = hasASTChildren(node);
  let valueStr = getASTValuePreview(node);

  let html = `<div class="ast-node" style="margin-left:${depth > 0 ? 20 : 0}px">`;
  html += `<div class="ast-node-header">`;

  if (hasChildren) {
    html += `<span class="ast-toggle">▼</span>`;
  } else {
    html += `<span class="ast-toggle" style="visibility:hidden">▼</span>`;
  }

  html += `<span class="ast-node-type">${escapeHtml(type)}</span>`;

  if (valueStr) {
    html += ` <span class="ast-node-value">${escapeHtml(valueStr)}</span>`;
  }

  if (node.line) {
    html += ` <span class="ast-node-line">:${node.line}</span>`;
  }

  html += `</div>`;

  if (hasChildren) {
    html += `<div class="ast-children">`;
    const children = getASTChildren(node);
    for (const [key, child] of children) {
      if (child && typeof child === 'object') {
        if (Array.isArray(child)) {
          if (child.length > 0) {
            html += `<div style="margin-left:20px;margin-top:2px;">
              <span style="color:var(--text-dimmed);font-size:11px;">${key}:</span>
            </div>`;
            for (const item of child) {
              html += renderASTNode(item, depth + 2);
            }
          }
        } else {
          html += `<div style="margin-left:20px;margin-top:2px;">
            <span style="color:var(--text-dimmed);font-size:11px;">${key}:</span>
          </div>`;
          html += renderASTNode(child, depth + 2);
        }
      }
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function hasASTChildren(node) {
  const skipKeys = new Set(['type', 'line', 'value', 'name', 'op', 'func', 'number', 'varType', 'variable', 'target', 'text', 'openEnd', 'prompt', 'lineCount']);
  for (const key of Object.keys(node)) {
    if (skipKeys.has(key)) continue;
    const val = node[key];
    if (val && typeof val === 'object') return true;
  }
  return false;
}

function getASTChildren(node) {
  const skipKeys = new Set(['type', 'line', 'value', 'name', 'op', 'func', 'number', 'varType', 'variable', 'target', 'text', 'openEnd', 'prompt', 'lineCount']);
  const children = [];
  for (const [key, val] of Object.entries(node)) {
    if (skipKeys.has(key)) continue;
    if (val && typeof val === 'object') {
      children.push([key, val]);
    }
  }
  return children;
}

function getASTValuePreview(node) {
  const parts = [];
  if (node.name) parts.push(`name="${node.name}"`);
  if (node.value !== undefined && typeof node.value !== 'object') parts.push(`${node.value}`);
  if (node.op) parts.push(`op="${node.op}"`);
  if (node.func) parts.push(`fn="${node.func}"`);
  if (node.variable) parts.push(`var="${node.variable}"`);
  if (node.target) parts.push(`→ ${node.target}`);
  if (node.varType && node.varType !== 'undef') parts.push(`<${node.varType}>`);
  if (node.number) parts.push(`#${node.number}`);
  return parts.join(' ');
}

// ═══════════════════════════════════════════════════════════════
// Error Modal
// ═══════════════════════════════════════════════════════════════

function showErrorModal(error) {
  const modal = document.getElementById('error-modal');
  const phaseBadge = document.getElementById('error-phase-badge');
  const phaseText = document.getElementById('error-phase-text');
  const messageEl = document.getElementById('error-message');
  const sourceEl = document.getElementById('error-source');
  const lineNumEl = document.getElementById('error-line-num');
  const codeEl = document.getElementById('error-code');
  const pointerEl = document.getElementById('error-pointer');

  // Set phase
  const phaseNames = {
    lexer: 'LEXER',
    parser: 'PARSER',
    codegen: 'CODE GENERATION',
    execution: 'EXECUTION',
  };
  phaseBadge.setAttribute('data-phase', error.phase);
  phaseText.textContent = `Error in ${phaseNames[error.phase] || error.phase.toUpperCase()} Phase`;

  // Set message
  messageEl.textContent = error.message;

  // Set source code context
  if (error.sourceLine || (error.line > 0 && editor)) {
    const srcLine = error.sourceLine || (editor ? editor.getModel().getLineContent(error.line) : '');
    lineNumEl.textContent = error.line;
    codeEl.textContent = srcLine;
    sourceEl.style.display = 'flex';

    // Show pointer
    if (error.column > 0) {
      pointerEl.textContent = ' '.repeat(Math.max(0, error.column - 1)) + '^';
      pointerEl.style.display = 'block';
    } else {
      pointerEl.style.display = 'none';
    }
  } else {
    sourceEl.style.display = 'none';
    pointerEl.style.display = 'none';
  }

  modal.classList.add('show');

  // Highlight error line in editor
  if (error.line > 0 && editor) {
    editor.revealLineInCenter(error.line);
    const decorations = editor.deltaDecorations([], [{
      range: new monaco.Range(error.line, 1, error.line, 1),
      options: {
        isWholeLine: true,
        className: 'error-line-decoration',
        glyphMarginClassName: 'error-glyph',
        overviewRuler: { color: '#ef4444', position: monaco.editor.OverviewRulerLane.Full },
      }
    }]);

    // Clear decorations after 10 seconds
    setTimeout(() => {
      editor.deltaDecorations(decorations, []);
    }, 10000);
  }
}

function hideErrorModal() {
  document.getElementById('error-modal').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════════

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `content-${tabName}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// Examples
// ═══════════════════════════════════════════════════════════════

async function loadExamples() {
  try {
    const resp = await fetch('/api/examples');
    const data = await resp.json();
    const menu = document.getElementById('examples-menu');

    menu.innerHTML = data.examples.map(ex => `
      <button class="dropdown-item" data-example-id="${ex.id}">
        <span class="item-name">${escapeHtml(ex.name)}</span>
        <span class="item-desc">${escapeHtml(ex.description)}</span>
      </button>
    `).join('');

    menu.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.exampleId;
        try {
          const resp = await fetch(`/api/examples/${id}`);
          const ex = await resp.json();
          if (editor && ex.code) {
            editor.setValue(ex.code);
            showToast(`Loaded: ${ex.name}`, 'success');
          }
        } catch (err) {
          showToast('Failed to load example', 'error');
        }
        toggleExamplesMenu(false);
      });
    });
  } catch (err) {
    console.error('Failed to load examples:', err);
  }
}

function toggleExamplesMenu(forceState) {
  const menu = document.getElementById('examples-menu');
  const show = forceState !== undefined ? forceState : !menu.classList.contains('show');
  menu.classList.toggle('show', show);
}

// ═══════════════════════════════════════════════════════════════
// Toast Notifications
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
  };

  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(message)}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// Event Listeners
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Monaco
  initMonaco();

  // Load examples
  loadExamples();

  // Run button
  document.getElementById('run-btn').addEventListener('click', runCode);

  // Clear button
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (editor) {
      editor.setValue('');
      editor.focus();
    }
  });

  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Examples dropdown
  document.getElementById('examples-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExamplesMenu();
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.examples-dropdown')) {
      toggleExamplesMenu(false);
    }
  });

  // Error modal close buttons
  document.getElementById('error-close').addEventListener('click', hideErrorModal);
  document.getElementById('error-dismiss').addEventListener('click', hideErrorModal);
  document.getElementById('error-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideErrorModal();
  });

  // Go to error line
  document.getElementById('error-goto-line').addEventListener('click', () => {
    if (lastResult?.error?.line > 0 && editor) {
      editor.revealLineInCenter(lastResult.error.line);
      editor.setPosition({ lineNumber: lastResult.error.line, column: lastResult.error.column || 1 });
      editor.focus();
    }
    hideErrorModal();
  });

  // Copy output
  document.getElementById('copy-output').addEventListener('click', () => {
    const terminal = document.getElementById('output-terminal');
    const text = terminal.innerText;
    navigator.clipboard.writeText(text).then(() => {
      showToast('Output copied to clipboard', 'success');
    }).catch(() => {
      showToast('Failed to copy', 'error');
    });
  });

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideErrorModal();
    }
  });
});
