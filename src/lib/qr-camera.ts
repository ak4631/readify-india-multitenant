export function cameraErrorMessage(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was denied. Allow camera access in your browser, or enter the Booking ID below.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No suitable camera was found. Enter the Booking ID instead.";
  if (name === "NotReadableError")
    return "The camera is being used by another app. Close it and try again, or enter the Booking ID.";
  return "Could not open the camera. Use a secure HTTPS connection, or enter the Booking ID instead.";
}

// Returns cleanup immediately, including while the permission prompt is open.
export function startQrCamera(
  video: HTMLVideoElement,
  onScan: (value: string) => void,
  onError: (message: string) => void,
) {
  let stopped = false;
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };
  void (async () => {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error("Camera unavailable");
      const { default: decode } = await import("jsqr");
      if (stopped) return;
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      });
      if (stopped) {
        acquired.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
      if (stopped) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Camera image unavailable");
      const scan = () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            canvas.width = Math.min(video.videoWidth, 800);
            canvas.height = Math.round(
              (video.videoHeight * canvas.width) / video.videoWidth,
            );
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            const code = decode(frame.data, frame.width, frame.height, {
              inversionAttempts: "dontInvert",
            });
            if (code?.data.trim()) {
              const value = code.data.trim();
              stop();
              if (value.length > 100)
                onError(
                  "This QR is not a booking code. Scan the customer's booking QR or enter the Booking ID.",
                );
              else onScan(value);
              return;
            }
          }
          timer = setTimeout(scan, 200);
        } catch (error) {
          stop();
          onError(cameraErrorMessage(error));
        }
      };
      scan();
    } catch (error) {
      if (!stopped) {
        stop();
        onError(cameraErrorMessage(error));
      }
    }
  })();
  return stop;
}
