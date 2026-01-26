interface TrailPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface DragPoint {
  x: number;
  y: number;
}

interface VirtualTouchPoint {
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
  private dragPoint: DragPoint | null = null;
  private virtualTouchPoint: VirtualTouchPoint | null = null;
  private readonly virtualTouchDuration: number = 2000; // milliseconds
  private readonly circleRadius: number = 6; // 2x the line width (3 * 2)

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

    // Update drag point to current position
    this.dragPoint = { x, y };
  }

  clearDragPoint(): void {
    this.dragPoint = null;
  }

  setVirtualTouchPoint(x: number, y: number): void {
    if (!this.enabled) return;

    const now = performance.now();
    this.virtualTouchPoint = { x, y, timestamp: now };
  }

  updateVirtualTouchPoint(dx: number, dy: number): void {
    if (!this.virtualTouchPoint) return;

    // Move the virtual touch point opposite to the pan direction
    // (because panBy moves the map, not the viewport)
    this.virtualTouchPoint.x -= dx;
    this.virtualTouchPoint.y -= dy;

    // Add trail point at the virtual touch position
    if (this.enabled) {
      const now = performance.now();
      this.trail.push({
        x: this.virtualTouchPoint.x,
        y: this.virtualTouchPoint.y,
        timestamp: now
      });
    }
  }

  clearVirtualTouchPoint(): void {
    this.virtualTouchPoint = null;
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

    if (!this.enabled) return;

    const now = performance.now();

    // Remove old points from trail
    this.trail = this.trail.filter(point => now - point.timestamp <= this.trailDuration);

    // Draw the trail
    if (this.trail.length >= 2) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.trail[0].x, this.trail[0].y);

      for (let i = 1; i < this.trail.length; i++) {
        this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }

      this.ctx.stroke();
    }

    // Check if virtual touch point has expired
    if (this.virtualTouchPoint && now - this.virtualTouchPoint.timestamp > this.virtualTouchDuration) {
      this.virtualTouchPoint = null;
    }

    // Draw the circle at drag point or virtual touch point
    const circlePoint = this.dragPoint || this.virtualTouchPoint;
    if (circlePoint) {
      this.ctx.beginPath();
      this.ctx.arc(circlePoint.x, circlePoint.y, this.circleRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      this.ctx.fill();
    }
  }

  clear(): void {
    this.trail = [];
    this.dragPoint = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.stopAnimation();
    this.clear();
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
}
