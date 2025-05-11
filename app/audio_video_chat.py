import os
import sys


import gradio as gr

from dotenv import load_dotenv
from fastrtc import (
    Stream,
    WebRTC,
    get_cloudflare_turn_credentials_async,
)
from gradio.utils import get_space

from handlers.gemini_handler import GeminiHandler

load_dotenv()


# Get the absolute path to the statics directory
current_dir = os.path.dirname(os.path.abspath(__file__))
statics_dir = os.path.join(current_dir, "statics")

# Add custom JavaScript for screen sharing
screen_share_js = open(os.path.join(statics_dir, "js", "share_screen.js")).read()
custom_js_injection = f"<script>{screen_share_js}</script>"

css = open(os.path.join(statics_dir, "css", "style.css")).read()

stream = Stream(
    handler=GeminiHandler(),
    modality="audio-video",
    mode="send-receive",
    rtc_configuration=get_cloudflare_turn_credentials_async,
    time_limit=180 if get_space() else None,
    additional_inputs=[
        gr.Image(label="Image", type="numpy", sources=["upload", "clipboard"])
    ],
    ui_args={
        "icon": "https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png",
        "pulse_color": "rgb(255, 255, 255)",
        "icon_button_color": "rgb(255, 255, 255)",
        "title": "Gemini Audio Video Chat",
    },
)



with gr.Blocks(css=css, head=custom_js_injection) as demo:
    gr.HTML(
        """
    <div style='display: flex; align-items: center; justify-content: center; gap: 20px'>
        <div style="background-color: var(--block-background-fill); border-radius: 8px">
            <img src="https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png" style="width: 100px; height: 100px;">
        </div>
        <div>
            <h1>Gen AI SDK Voice Chat</h1>
            <p>Speak with Gemini using real-time audio + video streaming</p>
            <p>Get an API Key <a href="https://support.google.com/googleapi/answer/6158862?hl=en">here</a></p>
        </div>
    </div>
    """
    )
    
    # Add controls for screen sharing
    with gr.Row(elem_classes="stream-control-buttons"):
        screen_share_button = gr.Button("Share Screen", elem_id="screen-share-button")
        camera_button = gr.Button("Switch to Camera", elem_id="camera-button")
    
    with gr.Row() as row:
        with gr.Column():
            webrtc = WebRTC(
                label="Video Chat 1",
                modality="audio-video",
                mode="send-receive",
                elem_id="video-source",
                rtc_configuration=get_cloudflare_turn_credentials_async,
                icon="https://www.gstatic.com/lamda/images/gemini_favicon_f069958c85030456e93de685481c559f160ea06b.png",
                pulse_color="rgb(255, 255, 255)",
                icon_button_color="rgb(255, 255, 255)",
            )
        with gr.Column():
            image_input = gr.Image(
                label="Image", type="numpy", sources=["upload", "clipboard", "webcam"]
            )
            
    
    screen_share_button.click(fn=None, js="startScreenShareGlobal")
    camera_button.click(fn=None, js="switchToCameraGlobal")
    
    webrtc.stream(
        GeminiHandler(),
        inputs=[webrtc, image_input],
        outputs=[webrtc],
        time_limit=180 if get_space() else None,
        concurrency_limit=2 if get_space() else None,
    )

stream.ui = demo


if __name__ == "__main__":
    share = False
    if "--share" in sys.argv:
        share = True
    if (mode := os.getenv("MODE")) == "UI":
        stream.ui.launch(server_port=7860, share=share)
    else:
        stream.ui.launch(server_port=7860, share=share)