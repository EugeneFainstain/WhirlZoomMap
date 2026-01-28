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
  private readonly areaThreshold: number = 1000; // Area threshold for zoom activation
  private zoomActivated: boolean = false;

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
    this.ctx.strokeStyle = 'rgba(70, 70, 70, 0.8)';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Reapply styles after resize
    this.ctx.strokeStyle = 'rgba(70, 70, 70, 0.8)';
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
    const now = performance.now();

    // Remove old points to keep trail bounded (even when not visualizing)
    this.trail = this.trail.filter(point => now - point.timestamp <= this.trailDuration);

    this.trail.push({ x, y, timestamp: now });

    // Update drag point to current position
    this.dragPoint = { x, y };
  }

  clearDragPoint(): void {
    this.dragPoint = null;
  }

  setVirtualTouchPoint(x: number, y: number): void {
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

  getSignedArea(): number {
    const currentPoint = this.dragPoint || this.virtualTouchPoint;
    let totalSignedArea = 0;

    if (currentPoint && this.trail.length >= 2) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const p1 = this.trail[i];
        const p2 = this.trail[i + 1];
        const p3 = currentPoint;

        // Calculate signed area using cross product
        const signedArea = 0.5 * ((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));
        totalSignedArea += signedArea;
      }
    }

    return totalSignedArea;
  }

  private getCenterOfMass(): { x: number; y: number } | null {
    if (this.trail.length === 0) return null;

    let sumX = 0;
    let sumY = 0;
    for (const point of this.trail) {
      sumX += point.x;
      sumY += point.y;
    }

    return {
      x: sumX / this.trail.length,
      y: sumY / this.trail.length
    };
  }

  getSweptAngle(): number {
    if (this.trail.length < 2) return 0;

    const center = this.getCenterOfMass();
    if (!center) return 0;

    let sweptAngle = 0;

    for (let i = 0; i < this.trail.length - 1; i++) {
      const p1 = this.trail[i];
      const p2 = this.trail[i + 1];

      // Calculate angles from center of mass to each point
      const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
      const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);

      // Calculate angle difference, handling wrap-around
      let angleDiff = angle2 - angle1;

      // Normalize to [-PI, PI]
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      sweptAngle += angleDiff;
    }

    return sweptAngle;
  }

  getFullCircles(): number {
    const sweptAngle = this.getSweptAngle();
    const sign = sweptAngle >= 0 ? 1 : -1;
    return sign * Math.max(0, Math.abs(sweptAngle) - Math.PI) / Math.PI;
  }

  getAreaThreshold(): number {
    return this.areaThreshold;
  }

  setZoomActivated(activated: boolean): void {
    this.zoomActivated = activated;
  }

  private drawSpiralArc(centerX: number, centerY: number, fullCircles: number): void {
    if (fullCircles === 0) return;

    const baseRadius = 40; // Starting radius of the spiral
    const radiusGrowth = 5; // How much the radius grows per full circle
    const segments = 100; // Number of line segments to draw the spiral

    // Positive fullCircles = clockwise = red
    // Negative fullCircles = counter-clockwise = blue
    const isClockwise = fullCircles > 0;
    const color = isClockwise ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 100, 255, 0.8)';
    const absFullCircles = Math.abs(fullCircles);

    // Total angle to sweep (in radians)
    const totalAngle = absFullCircles * 2 * Math.PI;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // Parameter from 0 to 1
      const angle = t * totalAngle;

      // For clockwise (positive), start at top and go clockwise (negative angle direction)
      // For counter-clockwise (negative), start at top and go counter-clockwise (positive angle direction)
      const startAngle = -Math.PI / 2; // Start at top
      const currentAngle = isClockwise ? startAngle + angle : startAngle - angle;

      // Spiral: radius increases with angle
      const radius = baseRadius + (angle / (2 * Math.PI)) * radiusGrowth;

      const x = centerX + radius * Math.cos(currentAngle);
      const y = centerY + radius * Math.sin(currentAngle);

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.stroke();
  }

  private draw(): void {
    // Clear the canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!this.enabled) return;

    const now = performance.now();

    // Remove old points from trail
    this.trail = this.trail.filter(point => now - point.timestamp <= this.trailDuration);

    // Check if virtual touch point has expired
    if (this.virtualTouchPoint && now - this.virtualTouchPoint.timestamp > this.virtualTouchDuration) {
      this.virtualTouchPoint = null;
    }

    // Get the current point (drag point or virtual touch point)
    const currentPoint = this.dragPoint || this.virtualTouchPoint;

    // Draw triangles from adjacent trail points to the current point
    const totalSignedArea = this.getSignedArea();
    if (currentPoint && this.trail.length >= 2) {
      for (let i = 0; i < this.trail.length - 1; i++) {
        const p1 = this.trail[i];
        const p2 = this.trail[i + 1];
        const p3 = currentPoint;

        // Calculate signed area using cross product
        // Signed area = 0.5 * ((x2-x1)*(y3-y1) - (x3-x1)*(y2-y1))
        const signedArea = 0.5 * ((p2.x - p1.x) * (p3.y - p1.y) - (p3.x - p1.x) * (p2.y - p1.y));

        // Choose color based on signed area
        // Positive (counterclockwise) = red, Negative (clockwise) = blue
        this.ctx.fillStyle = signedArea > 0 ? 'rgba(255, 0, 0, 0.4)' : 'rgba(0, 100, 255, 0.4)';

        // Draw filled triangle
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.closePath();
        this.ctx.fill();
      }
    }

    // Draw the trail
    if (this.trail.length >= 2) {
      this.ctx.strokeStyle = 'rgba(70, 70, 70, 0.8)';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(this.trail[0].x, this.trail[0].y);

      for (let i = 1; i < this.trail.length; i++) {
        this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }

      this.ctx.stroke();
    }

    // Draw area circles - positioned horizontally centered, vertically aligned with visualize checkbox
    if (currentPoint) {
      // Get position: horizontally centered, vertically aligned with visualize checkbox
      const visualizeToggle = document.getElementById('visualize-toggle');
      const circleX = this.canvas.width / 2;
      let circleY = 110; // Default fallback
      if (visualizeToggle) {
        const rect = visualizeToggle.getBoundingClientRect();
        circleY = rect.top + rect.height / 2; // Vertically centered with checkbox
      }

      // Draw green threshold circle (only visible before zoom activation)
      if (!this.zoomActivated) {
        const thresholdRadius = Math.sqrt(this.areaThreshold) * 0.5;
        this.ctx.strokeStyle = 'rgba(0, 180, 0, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(circleX, circleY, thresholdRadius, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw red/blue area circle on top (only when there's area)
      if (totalSignedArea !== 0) {
        const radius = Math.sqrt(Math.abs(totalSignedArea)) * 0.5; // Circle AREA is proportional to covered AREA
        const color = totalSignedArea > 0 ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 100, 255, 0.8)';

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw swept angle spiral indicator
      const fullCircles = this.getFullCircles();
      if (fullCircles !== 0) {
        this.drawSpiralArc(circleX, circleY, fullCircles);
      }
    }

    // Draw the circle at drag point or virtual touch point
    if (currentPoint) {
      this.ctx.beginPath();
      this.ctx.arc(currentPoint.x, currentPoint.y, this.circleRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(70, 70, 70, 0.8)';
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
