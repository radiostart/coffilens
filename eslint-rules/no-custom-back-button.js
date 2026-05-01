/**
 * ESLint custom rule — 자체 뒤로가기 버튼 사용 차단.
 *
 * 토스 비게임 가이드 4-2: 자체 백버튼 추가 금지 (대표 검수 반려 사유).
 * 좌측 뒤로가기는 토스 WebView 가 자동 제공.
 */

const BLOCKED_TEXTS = ["뒤로", "이전", "←"];

function isBackTextLiteral(text) {
  if (typeof text !== "string") return false;
  const trimmed = text.trim();
  return BLOCKED_TEXTS.some((blocked) => trimmed === blocked);
}

function isHistoryBackCall(node) {
  // history.back() / window.history.back()
  const callee = node.callee;
  if (callee.type !== "MemberExpression") return false;

  if (callee.property.type !== "Identifier") return false;

  if (
    callee.property.name === "back" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "history"
  ) {
    return true;
  }

  if (
    callee.property.name === "back" &&
    callee.object.type === "MemberExpression" &&
    callee.object.property.type === "Identifier" &&
    callee.object.property.name === "history"
  ) {
    return true;
  }

  // history.go(-1) / window.history.go(-1)
  if (callee.property.name === "go" && node.arguments.length > 0) {
    const arg = node.arguments[0];
    const isNegativeOne =
      (arg.type === "Literal" && arg.value === -1) ||
      (arg.type === "UnaryExpression" &&
        arg.operator === "-" &&
        arg.argument.type === "Literal" &&
        arg.argument.value === 1);
    if (!isNegativeOne) return false;

    if (callee.object.type === "Identifier" && callee.object.name === "history")
      return true;
    if (
      callee.object.type === "MemberExpression" &&
      callee.object.property.type === "Identifier" &&
      callee.object.property.name === "history"
    )
      return true;
  }

  return false;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "자체 뒤로가기 버튼 사용 차단 (토스 비게임 검수 반려 사유). 좌측 뒤로가기는 토스 WebView 자동 제공.",
    },
    messages: {
      historyBack:
        "history.back() / history.go(-1) 사용 금지. 토스 nav-bar 의 자동 백버튼을 사용하세요.",
      backText:
        '자체 백버튼으로 보이는 텍스트 "{{text}}". 토스 nav-bar 의 자동 백버튼을 사용하세요.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isHistoryBackCall(node)) {
          context.report({ node, messageId: "historyBack" });
        }
      },
      JSXText(node) {
        if (isBackTextLiteral(node.value)) {
          context.report({
            node,
            messageId: "backText",
            data: { text: node.value.trim() },
          });
        }
      },
    };
  },
};

export default rule;
