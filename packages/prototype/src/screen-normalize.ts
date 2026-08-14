// Some model generations wrap the ENTIRE markup or styles payload in an XML
// CDATA section (`<![CDATA[ ... ]]>`). That marker is meaningless in an HTML
// fragment: the HTML parser reads the leading `<![CDATA[` as a bogus comment and
// swallows the first real element (collapsing the layout), and inside a <style>
// it invalidates the first rule and detaches the `:root` variable block -- either
// way the screen renders unstyled. The wrapper is intermittent, so nothing
// downstream can assume it is present or absent; strip it here.
const CDATA_OPEN = "<![CDATA[";
const CDATA_CLOSE = "]]>";

// Only a wrapper that spans the WHOLE value is removed. Inner CDATA (e.g. inside
// an inline <svg><style>) is left untouched because it is legal there, and a
// value that merely contains "]]>" partway through is not treated as wrapped.
export function stripCdataWrapper(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= CDATA_OPEN.length + CDATA_CLOSE.length &&
    trimmed.startsWith(CDATA_OPEN) &&
    trimmed.endsWith(CDATA_CLOSE) &&
    // The first "]]>" must be the terminating one; otherwise the value holds
    // multiple sections and slicing the outer pair would leave stray markers.
    trimmed.indexOf(CDATA_CLOSE) === trimmed.length - CDATA_CLOSE.length
  ) {
    return trimmed.slice(CDATA_OPEN.length, trimmed.length - CDATA_CLOSE.length);
  }
  return value;
}
