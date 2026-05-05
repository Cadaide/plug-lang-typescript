export class Path {
  static join(p1: string, p2: string) {
    let output = p1;

    if (!p1.endsWith("/")) output += "/";
    if (p2.startsWith("/")) p2 = p2.slice(1);

    output += p2;

    return output;
  }
}
