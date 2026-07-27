const MAX_ROOM_NAME_LENGTH = 120;

export function deriveRoomNameFromFiles(fileNames: string[]) {
  if (fileNames.length === 0) {
    return "Imported documents";
  }

  const base = fileNames[0]
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim();
  const readable = base
    ? base.charAt(0).toUpperCase() + base.slice(1)
    : "Imported documents";
  const suffix =
    fileNames.length > 1
      ? ` and ${fileNames.length - 1} more`
      : "";
  const name = `${readable}${suffix}`;

  return name.length > MAX_ROOM_NAME_LENGTH
    ? name.slice(0, MAX_ROOM_NAME_LENGTH).trimEnd()
    : name;
}
