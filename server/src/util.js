export function jsonResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message) {
  return { isError: true, content: [{ type: "text", text: message }] };
}
