import "./tailwind.css";

import AudioProcessor from "./audio-processor/audio-processor";

const audioProcessor = new AudioProcessor();
audioProcessor.requestUserMedia().then((succ) => {
	if (!succ) {
		console.error('Something went wrong');
	}
	else {
		requestAnimationFrame(audioProcessor.dispatchAudio);
	}
})
