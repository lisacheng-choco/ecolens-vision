export function consumeSseBuffer(buffer: string) {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  const messages = blocks.flatMap((block) => block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)).message as string));

  return { messages, rest };
}
