export function hasMeaningfulChange(
  previous: Uint8ClampedArray | null,
  current: Uint8ClampedArray,
  threshold = 8,
) {
  if (!previous || previous.length !== current.length) return true;

  let difference = 0;
  for (let index = 0; index < current.length; index += 4) {
    difference += Math.abs(current[index] - previous[index]);
    difference += Math.abs(current[index + 1] - previous[index + 1]);
    difference += Math.abs(current[index + 2] - previous[index + 2]);
  }

  return difference / (current.length / 4 * 3) >= threshold;
}
