export function getRms(data: Float32Array) {
  let acc = 0;
  const len = data.length;

  for (let i = 0; i < len; ++i)
    acc += data[i] * data[i];
  
  return Math.sqrt(acc / len);
}
