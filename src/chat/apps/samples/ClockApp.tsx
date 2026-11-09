/* Sample app: Swiss Railway Clock, mirrored from goose's built-in
 * goose_apps/clock.html — sweeping second hand, 12-o'clock pause. The
 * face keeps the clock's identity colors; window chrome stays khala. */
import { useEffect, useRef } from "react";

const HAND_COLOR = "#17171c"; // khala --ink, reads as black on the face
const RED = "#d32f2f";

function drawFace(ctx: CanvasRenderingContext2D, radius: number) {
  const c = radius;
  ctx.beginPath();
  ctx.arc(c, c, radius - 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = HAND_COLOR;
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i < 60; i++) {
    const angle = i * 6 * (Math.PI / 180);
    const isHour = i % 5 === 0;
    const inner = radius - (isHour ? 40 : 25);
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(angle) * (radius - 15), c - Math.cos(angle) * (radius - 15));
    ctx.lineTo(c + Math.sin(angle) * inner, c - Math.cos(angle) * inner);
    ctx.strokeStyle = HAND_COLOR;
    ctx.lineWidth = isHour ? 8 : 2;
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  ctx.font = "13px sans-serif";
  ctx.fillStyle = HAND_COLOR;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("KHALA CLOCK", c, c - 65);
}

function drawTaperedHand(ctx: CanvasRenderingContext2D, c: number, angle: number, length: number, width: number) {
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.rect(-width / 2, -length, width, length + 20);
  ctx.fillStyle = HAND_COLOR;
  ctx.fill();
  ctx.restore();
}

function drawSecondHand(ctx: CanvasRenderingContext2D, c: number, angle: number, length: number) {
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, length * 0.2);
  ctx.lineTo(0, -length);
  ctx.strokeStyle = RED;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "butt";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -length, 10, 0, 2 * Math.PI);
  ctx.fillStyle = RED;
  ctx.fill();
  ctx.restore();
}

export function ClockApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let lastSecond = -1;
    let pauseUntil = 0;

    const draw = () => {
      const now = Date.now();
      const date = new Date(now);
      const radius = canvas.width / 2;
      const c = radius;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawFace(ctx, radius);

      const seconds = date.getSeconds();
      if (seconds === 0 && lastSecond === 59) pauseUntil = now + 1500;
      lastSecond = seconds;

      const hours = date.getHours() % 12;
      const minutes = date.getMinutes();
      const hourAngle = (hours + minutes / 60) * 30 * (Math.PI / 180);
      drawTaperedHand(ctx, c, hourAngle, radius * 0.65, 11);
      const minuteAngle = (minutes + seconds / 60) * 6 * (Math.PI / 180);
      drawTaperedHand(ctx, c, minuteAngle, radius * 0.9, 8);

      const secondAngle =
        now < pauseUntil ? 0 : (seconds + date.getMilliseconds() / 1000) * 6 * (Math.PI / 180);
      drawSecondHand(ctx, c, secondAngle, radius * 0.65);

      ctx.beginPath();
      ctx.arc(c, c, 6, 0, 2 * Math.PI);
      ctx.fillStyle = RED;
      ctx.fill();

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="sa-root sa-clock" data-testid="chat-sample-app" data-sample="clock">
      <canvas ref={canvasRef} width={300} height={300} data-testid="chat-sample-clock-canvas" />
    </div>
  );
}
