interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

export class TrailVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private trail: TrailPoint[] = [];
  private readonly trailDuration: number = 250; // milliseconds
  private animationId: number | null = null;
  private enabled: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas');
    }
    this.ctx = ctx;

    // Set canvas size to match window
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Configure drawing style
    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Reapply styles after resize
    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
      this.stopAnimation();
    } else {
      this.startAnimation();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  addPoint(x: number, y: number): void {
    if (!this.enabled) return;

    const now = performance.now();
    this.trail.push({ x, y, timestamp: now });
  }

  private startAnimation(): void {
    if (this.animationId !== null) return;

    const animate = () => {
      this.draw();
      this.animationId = requestAnimationFrame(animate);
    };

    this.animationId = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private draw(): void {
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.enabled || this.trail.length === 0) return;

    const now = performance.now();

    // Remove old points
    this.trail = this.trail.filter(point => now - point.timestamp <= this.trailDuration);

    // Draw the trail
    if (this.trail.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(this.trail[0].x, this.trail[0].y);

    for (let i = 1; i < this.trail.length; i++) {
      this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
    }

    this.ctx.stroke();
  }

  clear(): void {
    this.trail = [];
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.stopAnimation();
    this.clear();
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
}
