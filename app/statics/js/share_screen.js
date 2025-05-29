(function() {
    // Global variable to store the peer connection once we find it
    window.__rtcPeerConnection = null;

    // Function to intercept RTCPeerConnection creation
    function setupConnectionInterceptor() {
        console.log("Setting up RTCPeerConnection interceptor");
        // Store the original RTCPeerConnection constructor
        const originalRTC = window.RTCPeerConnection;
        
        // Override with our intercepting version
        window.RTCPeerConnection = function(...args) {
            // Create the real connection object
            const pc = new originalRTC(...args);
            console.log("Intercepted new RTCPeerConnection creation");
            
            // Store it globally for later use
            window.__rtcPeerConnection = pc;
            
            return pc;
        };
        
        // Copy prototype to maintain all methods and properties
        window.RTCPeerConnection.prototype = originalRTC.prototype;
    }

    // Setup the interceptor right away
    setupConnectionInterceptor();

    // Function to safely get the WebRTC component with retries
    async function getWebRTCComponent(maxRetries = 5, delay = 500) {
        let retries = 0;
        
        while (retries < maxRetries) {
            // Try different selectors to find the component
            const element = document.getElementById('video-source') || 
                           document.querySelector('.webrtc');
            
            if (element) {
                console.log("Found WebRTC element:", element);
                
                // Make sure the internal WebRTC object is initialized
                if (element._webrtc || element.querySelector('video')) {
                    return element;
                }
                console.log("WebRTC element found but not fully initialized, retrying...");
            }
            
            // Wait before trying again
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
            console.log(`Retry ${retries}/${maxRetries} to find WebRTC component`);
        }
        
        throw new Error("Could not find initialized WebRTC component after multiple attempts");
    }

    // Helper to get or create stream with proper handling
    async function replaceStream(webrtcElement, mediaConstraints, isScreenShare) {
        try {
            // Get reference to existing video element
            const existingVideoElement = webrtcElement.querySelector('video');
            let audioTrack = null;
            
            // If screen sharing, try to preserve the existing audio track
            if (isScreenShare && existingVideoElement && existingVideoElement.srcObject) {
                const audioTracks = existingVideoElement.srcObject.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioTrack = audioTracks[0];
                    console.log("Preserving existing audio track for screen sharing");
                }
            }
            
            // Stop existing video tracks only
            if (existingVideoElement && existingVideoElement.srcObject) {
                existingVideoElement.srcObject.getVideoTracks().forEach(track => track.stop());
            }
            
            // Get new media stream
            let mediaStream;
            if (isScreenShare) {
                // For screen sharing, only request video by default
                mediaStream = await navigator.mediaDevices.getDisplayMedia({ 
                    video: true,
                    audio: false  // Don't request audio for screen by default
                });
                
                // If we have a saved audio track, add it to the new stream
                if (audioTrack) {
                    mediaStream.addTrack(audioTrack);
                } else if (mediaConstraints.audio) {
                    // If no saved audio track but audio is requested, get microphone audio
                    try {
                        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        audioStream.getAudioTracks().forEach(track => mediaStream.addTrack(track));
                        console.log("Added microphone audio track to screen sharing");
                    } catch (audioError) {
                        console.warn("Couldn't add microphone audio to screen sharing:", audioError);
                    }
                }
            } else {
                // For camera, use getUserMedia with provided constraints
                mediaStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            }
            
            console.log("Got new media stream:", mediaStream);
            
            // Find the video element and update its source
            const videoElement = webrtcElement.querySelector('video');
            if (videoElement) {
                videoElement.srcObject = mediaStream;
                console.log("Updated video element source");
                
                // Handle mirroring - turn off mirroring for screen sharing, enable for camera
                if (isScreenShare) {
                    videoElement.style.transform = 'none'; // No mirroring for screen sharing
                } else {
                    videoElement.style.transform = 'scaleX(-1)'; // Mirror for camera
                }
            } else {
                console.error("Video element not found within WebRTC component");
            }
            
            // Update the WebRTC peer connection if available
            if (window.__rtcPeerConnection) {
                const peerConnection = window.__rtcPeerConnection;
                console.log("Using captured RTCPeerConnection");
                
                try {
                    const senders = peerConnection.getSenders();
                    console.log("Connection senders:", senders);
                    
                    // Replace video track
                    const videoTrack = mediaStream.getVideoTracks()[0];
                    if (videoTrack && senders.length > 0) {
                        const videoSender = senders.find(sender => 
                            sender.track && sender.track.kind === 'video'
                        );
                        
                        if (videoSender) {
                            console.log("Replacing video track in WebRTC connection");
                            await videoSender.replaceTrack(videoTrack);
                            console.log("Successfully replaced video track");
                        } else {
                            console.warn("No video sender found in the senders array");
                            
                            // Attempt to find video sender by index (usually 0 or 1)
                            if (senders.length >= 1) {
                                // Try the first sender (likely video)
                                await senders[0].replaceTrack(videoTrack);
                                console.log("Replaced track in first sender");
                            }
                        }
                    } else {
                        console.warn("No video track or senders found");
                    }
                } catch (err) {
                    console.error("Error updating peer connection tracks:", err);
                }
            } else {
                console.warn("No RTCPeerConnection captured. Screen sharing may not work properly.");
                // Try direct browser API access
                console.log("Attempting to use browser's internal API to capture WebRTC connection...");
                
                try {
                    // Option to directly access chrome webrtc internals if available
                    if (webrtcElement.id && window.chrome && chrome.webrtc) {
                        chrome.webrtc.getStats(function(stats) {
                            console.log("Chrome WebRTC stats:", stats);
                        });
                    }
                } catch (e) {
                    console.log("Chrome WebRTC API not available");
                }
            }
            
            return mediaStream;
        } catch (error) {
            console.error("Error setting up media stream:", error);
            throw error;
        }
    }

    // Start screen sharing
    window.startScreenShareGlobal = async function() {
        console.log("Starting screen share...");
        try {
            const webrtcElement = await getWebRTCComponent();
            await replaceStream(
                webrtcElement, 
                { video: true, audio: true },
                true // This is screen sharing
            );
            
            console.log("Screen sharing started successfully");
        } catch (error) {
            console.error("Failed to start screen sharing:", error);
            alert("Could not start screen sharing: " + error.message);
        }
    };

    // Switch back to camera
    window.switchToCameraGlobal = async function() {
        console.log("Switching to camera...");
        try {
            const webrtcElement = await getWebRTCComponent();
            await replaceStream(
                webrtcElement,
                { video: true, audio: true },
                false // This is not screen sharing
            );
            
            console.log("Switched to camera successfully");
        } catch (error) {
            console.error("Failed to switch to camera:", error);
            alert("Could not switch to camera: " + error.message);
        }
    };
})();