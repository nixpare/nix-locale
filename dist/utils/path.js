import path from "path";
export function relativePath(from, to) {
    let relative = path.relative(from, to).replaceAll('\\', '/');
    if (!relative.startsWith('.')) {
        relative = './' + relative;
    }
    return relative;
}
