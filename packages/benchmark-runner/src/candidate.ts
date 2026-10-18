import ts from 'typescript';

function parse(source: string, language: 'ts' | 'jsx'): ts.SourceFile {
  if (!source.trim() || source.length > 2 * 1024 * 1024)
    throw new Error('CANDIDATE_SOURCE_INVALID');
  const file = language === 'jsx' ? 'official.jsx' : 'official.ts';
  const diagnostics =
    ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
      reportDiagnostics: true,
    }).diagnostics ?? [];
  if (diagnostics.some((item) => item.category === ts.DiagnosticCategory.Error))
    throw new Error('CANDIDATE_SOURCE_INVALID');
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    language === 'jsx' ? ts.ScriptKind.JSX : ts.ScriptKind.TS,
  );
}
function matchingTests(ast: ts.SourceFile, title: string): ts.ExpressionStatement[] {
  const found: ts.ExpressionStatement[] = [];
  function visit(node: ts.Node): void {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const name = call.arguments[0];
      const body = call.arguments[1];
      if (
        ts.isIdentifier(call.expression) &&
        call.expression.text === 'it' &&
        call.arguments.length === 2 &&
        name &&
        ts.isStringLiteral(name) &&
        name.text === title &&
        body &&
        (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
      )
        found.push(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

/** Review only a complete added test, while proving all pinned control bytes survive unchanged. */
export function extractAddedTest(
  base: string,
  patched: string,
  title: string,
  language: 'ts' | 'jsx' = 'ts',
): string {
  const original = parse(base, language);
  const ast = parse(patched, language);
  const matches = matchingTests(ast, title);
  if (matchingTests(original, title).length || matches.length !== 1)
    throw new Error('CANDIDATE_TEST_NOT_UNIQUE');
  let prefix = 0;
  while (prefix < base.length && base[prefix] === patched[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    base[base.length - suffix - 1] === patched[patched.length - suffix - 1]
  )
    suffix++;
  if (prefix + suffix !== base.length || patched.length <= base.length)
    throw new Error('CANDIDATE_PATCH_NOT_PURE_INSERTION');
  const statement = matches[0]!;
  const block = statement.parent;
  const callback = block.parent;
  if (
    !ts.isBlock(block) ||
    !(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) ||
    !ts.isCallExpression(callback.parent) ||
    !ts.isIdentifier(callback.parent.expression) ||
    callback.parent.expression.text !== 'describe' ||
    callback.parent.arguments.length !== 2 ||
    callback.parent.arguments[1] !== callback
  )
    throw new Error('CANDIDATE_TEST_NOT_DIRECT');
  const start = statement.getStart(ast);
  const end = statement.end;
  // Remove the entire statement, not just the textual insertion. Inserting a
  // prefix in an existing test title must never turn that control into a candidate.
  // Whitespace may differ only at the single insertion boundary.
  const before = patched.slice(0, start).replace(/\s+$/, '');
  const after = patched.slice(end).replace(/^\s+/, '');
  if (
    before.length + after.length > base.length ||
    !base.startsWith(before) ||
    !base.endsWith(after) ||
    !/^\s*$/.test(base.slice(before.length, base.length - after.length))
  )
    throw new Error('EXECUTABLE_CHANGE_OUTSIDE_CANDIDATE');

  // Byte preservation alone does not preserve automatic semicolon insertion.
  // All original statements in this describe block must retain the same parse.
  let originalBlock: ts.Block | undefined;
  function findBlock(node: ts.Node): void {
    if (ts.isBlock(node) && node.getStart(original) === block.getStart(ast)) originalBlock = node;
    ts.forEachChild(node, findBlock);
  }
  findBlock(original);
  const controls = block.statements.filter((item) => item !== statement);
  if (
    !originalBlock ||
    controls.length !== originalBlock.statements.length ||
    controls.some(
      (item, index) => item.getText(ast) !== originalBlock!.statements[index]!.getText(original),
    )
  )
    throw new Error('CONTROL_PARSE_CHANGED');
  let directiveCount = 0;
  for (const control of originalBlock.statements) {
    if (!ts.isExpressionStatement(control) || !ts.isStringLiteral(control.expression)) break;
    directiveCount++;
  }
  if (block.statements.indexOf(statement) < directiveCount)
    throw new Error('CONTROL_DIRECTIVE_CHANGED');
  return patched.slice(start, end);
}
