import { Strings } from "./strings";

export default class AudioProcessor {
  connected: Boolean = false;

  fftSize: number = 2048;
  audioCtx: AudioContext = new AudioContext({
    sampleRate: 44100,
  });
  stream?: MediaStream;

  // Strings
  strings: Strings;
  stringsKeys: Array<string>;

  // Audio Nodes
  audioSrc?: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;

  // Freq buffer
  frequencyBufferLength: number = this.fftSize;
  frequencyBuffer: Float32Array;

  // Flags
  lastRms: number = 0;
  rmsThreshold: number = 0.006;
  assessedStringsInLastFrame: boolean = false;
  assessStringsUntilTime: number = 0;

  constructor() {
    this.strings = new Map([
      [
        "e2",
        {
          offset: Math.round(this.audioCtx.sampleRate / 82.4069),
          diff: 0,
        },
      ],

      [
        "a2",
        {
          offset: Math.round(this.audioCtx.sampleRate / 110),
          diff: 0,
        },
      ],

      [
        "d3",
        {
          offset: Math.round(this.audioCtx.sampleRate / 146.832),
          diff: 0,
        },
      ],

      [
        "g3",
        {
          offset: Math.round(this.audioCtx.sampleRate / 195.998),
          diff: 0,
        },
      ],

      [
        "b3",
        {
          offset: Math.round(this.audioCtx.sampleRate / 246.932),
          diff: 0,
        },
      ],

      [
        "e4",
        {
          offset: Math.round(this.audioCtx.sampleRate / 329.628),
          diff: 0,
        },
      ],
    ]);
    this.stringsKeys = Array.from(this.strings.keys());

    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = this.fftSize;

    this.frequencyBuffer = new Float32Array(this.frequencyBufferLength);

    // bind functions
    this.dispatchAudio = this.dispatchAudio.bind(this);
    this.sortStringKeysByDifference = this.sortStringKeysByDifference.bind(this);
  }

  async requestUserMedia(): Promise<Boolean> {
    if (navigator.mediaDevices) {
      const stream = await navigator.mediaDevices
        .getUserMedia({
          audio: true,
        })
        .catch((e) => {
          console.error(`Unexpected error: ${e}`);
        });

      if (stream) {
        this.connected = true;

        this.stream = stream;
        this.audioCtx.resume();
        this.audioSrc = this.audioCtx.createMediaStreamSource(this.stream);
        this.audioSrc.connect(this.analyserNode);
      }
    }

    return this.connected;
  }

  sortStringKeysByDifference(a: string, b: string): number {
    return this.strings.get(a)!.diff - this.strings.get(b)!.diff;
  }

  autocorrelateAudioData(time: DOMHighResTimeStamp) {
    const searchSize = this.frequencyBufferLength * 0.5;

    let offsetKey = null;
    let offset = 0;
    let difference = 0;
    const tolerance = 0.001;
    let rms = 0;
    const rmsMin = 0.008;
    
    let assessedStringsInLastFrame = this.assessedStringsInLastFrame;

    // Fill up the data.
    this.analyserNode.getFloatTimeDomainData(this.frequencyBuffer);

    // Figure out the root-mean-square, or rms, of the audio. Basically
    // this seems to be the amount of signal in the buffer.
    for (let d = 0; d < this.frequencyBuffer.length; d++) {
      rms += this.frequencyBuffer[d] * this.frequencyBuffer[d];
    }

    rms = Math.sqrt(rms / this.frequencyBuffer.length);

    // If there's little signal in the buffer quit out.
    if (rms < rmsMin) return 0;

    // Only check for a new string if the volume goes up. Otherwise assume
    // that the string is the same as the last frame.
    if (rms > this.lastRms + this.rmsThreshold)
      this.assessStringsUntilTime = time + 250;

    if (time < this.assessStringsUntilTime) {
      this.assessedStringsInLastFrame = true;

      // Go through each string and figure out which is the most
      // likely candidate for the string being tuned based on the
      // difference to the "perfect" tuning.
      for (let o = 0; o < this.stringsKeys.length; o++) {
        offsetKey = this.stringsKeys[o];
        offset = this.strings.get(offsetKey)!.offset;
        difference = 0;

        // Reset how often this string came out as the closest.
        if (assessedStringsInLastFrame === false)
          this.strings.get(offsetKey)!.diff = 0;

        // Now we know where the peak is, we can start
        // assessing this sample based on that. We will
        // step through for this string comparing it to a
        // "perfect wave" for this string.
        for (let i = 0; i < searchSize; i++) {
          difference += Math.abs(
            this.frequencyBuffer[i] - this.frequencyBuffer[i + offset]
          );
        }

        difference /= searchSize;

        // Weight the difference by frequency. So lower strings get
        // less preferential treatment (higher offset values). This
        // is because harmonics can mess things up nicely, so we
        // course correct a little bit here.
        this.strings.get(offsetKey)!.diff += difference * offset;
      }
    } else {
      this.assessedStringsInLastFrame = false;
    }

    // If this is the first frame where we've not had to reassess strings
    // then we will order by the string with the largest number of matches.
    if (
      assessedStringsInLastFrame === true &&
      this.assessedStringsInLastFrame === false
    ) {
      this.stringsKeys.sort(this.sortStringKeysByDifference);
    }

    // Next for the top candidate in the set, figure out what
    // the actual offset is from the intended target.
    // We'll do it by making a full sweep from offset - 10 -> offset + 10
    // and seeing exactly how long it takes for this wave to repeat itself.
    // And that will be our *actual* frequency.
    const searchRange = 10;
    const assumedString = this.strings.get(this.stringsKeys[0])!;
    const searchStart = assumedString.offset - searchRange;
    const searchEnd = assumedString.offset + searchRange;
    let actualFrequency = assumedString.offset;
    let smallestDifference = Number.POSITIVE_INFINITY;

    for (let s = searchStart; s < searchEnd; s++) {
      difference = 0;

      // For each iteration calculate the difference of every element of the
      // array. The data in the buffer should be PCM, so values ranging
      // from -1 to 1. If they match perfectly then they'd essentially
      // cancel out. But this is real data so we'll be looking for small
      // amounts. If it's below tolerance assume a perfect match, otherwise
      // go with the smallest.
      //
      // A better version of this would be to curve match on the data.
      for (let i = 0; i < searchSize; i++) {
        difference += Math.abs(
          this.frequencyBuffer[i] - this.frequencyBuffer[i + s]
        );
      }

      difference /= searchSize;

      if (difference < smallestDifference) {
        smallestDifference = difference;
        actualFrequency = s;
      }

      if (difference < tolerance) {
        actualFrequency = s;
        break;
      }
    }

    this.lastRms = rms;

    return this.audioCtx.sampleRate / actualFrequency;
  }

  dispatchAudio(time: DOMHighResTimeStamp) {
    if (this.connected) requestAnimationFrame(this.dispatchAudio);

    const frequency = this.autocorrelateAudioData(time);
    if (frequency === 0)
      return;
    
    const dominantFrequency = Math.log2(frequency / 440);
    const semitonesFromA4 = 12 * dominantFrequency;
    const octave = Math.floor(4 + ((9 + semitonesFromA4) / 12));
    let note = (12 + (Math.round(semitonesFromA4) % 12)) % 12;

    console.log(frequency, octave, note);
    console.log(this.strings)
    console.log(this.stringsKeys)
  }

  visualize(frequency: number, octave: number, note: number) {
    
  }
}
