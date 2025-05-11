import asyncio
import os
import time
from dotenv import load_dotenv
import numpy as np
import websockets
from fastrtc import AsyncAudioVideoStreamHandler, wait_for_item
from google import genai

from ..utils.medias import encode_audio, encode_image

load_dotenv()


class GeminiHandler(AsyncAudioVideoStreamHandler):
    def __init__(
        self,
        api_key: str = os.getenv("GEMINI_API_KEY"),
    ) -> None:
        super().__init__(
            "mono",
            output_sample_rate=24000,
            input_sample_rate=16000,
        )
        self.audio_queue = asyncio.Queue()
        self.video_queue = asyncio.Queue()
        self.session = None
        self.last_frame_time = 0
        self.quit = asyncio.Event()
        self.api_key = api_key

    def copy(self) -> "GeminiHandler":
        return GeminiHandler()

    async def start_up(self):
        client = genai.Client(
            api_key=self.api_key, http_options={"api_version": "v1alpha"}
        )
        config = {"response_modalities": ["AUDIO"]}
        async with client.aio.live.connect(
            model="gemini-2.0-flash-exp",
            config=config,  # type: ignore
        ) as session:
            self.session = session
            while not self.quit.is_set():
                turn = self.session.receive()
                try:
                    async for response in turn:
                        if data := response.data:
                            audio = np.frombuffer(data, dtype=np.int16).reshape(1, -1)
                        self.audio_queue.put_nowait(audio)
                except websockets.exceptions.ConnectionClosedOK:
                    print("connection closed")
                    break

    async def video_receive(self, frame: np.ndarray):
        self.video_queue.put_nowait(frame)

        if self.session:
            # send image every 1 second
            print(time.time() - self.last_frame_time)
            if time.time() - self.last_frame_time > 1:
                self.last_frame_time = time.time()
                await self.session.send(input=encode_image(frame))
                if self.latest_args[1] is not None:
                    await self.session.send(input=encode_image(self.latest_args[1]))

    async def video_emit(self):
        frame = await wait_for_item(self.video_queue, 0.01)
        if frame is not None:
            return frame
        else:
            return np.zeros((100, 100, 3), dtype=np.uint8)

    async def receive(self, frame: tuple[int, np.ndarray]) -> None:
        _, array = frame
        array = array.squeeze()
        audio_message = encode_audio(array)
        if self.session:
            await self.session.send(input=audio_message)

    async def emit(self):
        array = await wait_for_item(self.audio_queue, 0.01)
        if array is not None:
            return (self.output_sample_rate, array)
        return array

    async def shutdown(self) -> None:
        if self.session:
            self.quit.set()
            await self.session.close()
            self.quit.clear()

