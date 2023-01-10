export function getHammingWindow(size: number): Float32Array {
    if (size <= 1)
        return new Float32Array(0); // return empty array
    else {
        const result = new Float32Array(size);
        for (let i = 0; i < size; ++i)
            result[i] = hamming(i, size);
        return result;
    }
}

function hamming(idx: number, size: number) {
    return 0.54 - 0.46 * Math.cos(6.283185307179586 * idx / (size - 1));
}
