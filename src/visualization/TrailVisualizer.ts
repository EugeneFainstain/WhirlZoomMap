import {
  TRAIL_DURATION_MS,
  VIRTUAL_TOUCH_DURATION_MS,
  TRAIL_CIRCLE_RADIUS,
  TRAIL_LINE_WIDTH,
  TRAIL_STROKE_COLOR,
  TRAIL_FILL_COLOR,
  TRAIL_TRIANGLE_COLOR_POSITIVE,
  TRAIL_TRIANGLE_COLOR_NEGATIVE,
  TRAIL_CIRCLE_COLOR_POSITIVE,
  TRAIL_CIRCLE_COLOR_NEGATIVE,
  TRAIL_THRESHOLD_COLOR,
  TRAIL_THRESHOLD_FILL_COLOR,
  ZOOM_AREA_THRESHOLD,
  ZOOM_ALT1_THRESHOLD,
  ZOOM_FULL_CIRCLES_MULT,
  ZOOM_RATE_COEFF,
  ZOOM_BLOCK_DURATION_MS,
  SPIRAL_BASE_RADIUS,
  SPIRAL_RADIUS_GROWTH,
  SPIRAL_SEGMENTS,
  SPIRAL_LINE_WIDTH,
  SPIRAL_START_ANGLE,
  AREA_CIRCLE_X_RATIO,
  PRODUCT_CIRCLE_X_RATIO,
  INDICATOR_CIRCLE_DEFAULT_Y,
  INDICATOR_CIRCLE_SCALE,
  INDICATOR_STROKE_WIDTH,
  ZOOM_TEXT_FONT,
  ZOOM_TEXT_COLOR,
  ZOOM_TEXT_X_OFFSET,
} from '../control';

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
  private animationId: number | null = null;
  private enabled: boolean = false;
  private dragPoint: DragPoint | null = null;
  private virtualTouchPoint: VirtualTouchPoint | null = null;
  private zoomActivated: boolean = false;
  private alt1ZoomActivated: boolean = false;
  private zoomGetter: (() => number) | null = null;

  // Zoom block state - computed dynamically based on rotation and time
  private isRotating: boolean = false;
  private dragStartTime: number = 0;

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
    this.ctx.strokeStyle = TRAIL_STROKE_COLOR;
    this.ctx.lineWidth = TRAIL_LINE_WIDTH;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private resizeCanvas(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Reapply styles after resize
    this.ctx.strokeStyle = TRAIL_STROKE_COLOR;
    this.ctx.lineWidth = TRAIL_LINE_WIDTH;
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

    // During zoom block period, don't accumulate trail - only keep current point
    if (this.isZoomBlocked()) {
      this.trail = [];
    } else {
      // Remove old points to keep trail bounded (even when not visualizing)
      this.trail = this.trail.filter(point => now - point.timestamp <= TRAIL_DURATION_MS);
    }

    this.trail.push({ x, y, timestamp: now });
    // Note: dragPoint is now updated separately via updateDragPoint() for low-latency rendering
  }

  clearDragPoint(): void {
    this.dragPoint = null;
  }

  /**
   * Update the drag point position without adding to the trail.
   * Used for low-latency rendering via requestAnimationFrame.
   */
  updateDragPoint(x: number, y: number): void {
    this.dragPoint = { x, y };
  }

  /**
   * Force an immediate render of the canvas.
   * Used by external animation loops to ensure draw happens after dragPoint update.
   */
  render(): void {
    this.draw();
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

  getCompoundZoomValue(): number {
    const signedArea = this.getSignedArea();
    const fullCircles = this.getFullCircles();
    const signOfArea = signedArea >= 0 ? 1 : -1;
    const compoundValMult = ZOOM_FULL_CIRCLES_MULT * ZOOM_FULL_CIRCLES_MULT;
    return signedArea * fullCircles * compoundValMult * signOfArea;
  }

  getZoomRateCoeff(): number {
    return ZOOM_RATE_COEFF;
  }

  getAreaThreshold(): number {
    return ZOOM_AREA_THRESHOLD;
  }

  getAlt1Threshold(): number {
    return ZOOM_ALT1_THRESHOLD;
  }

  setZoomActivated(activated: boolean): void {
    this.zoomActivated = activated;
  }

  setAlt1ZoomActivated(activated: boolean): void {
    this.alt1ZoomActivated = activated;
  }

  setZoomBlocked(isRotating: boolean, dragStartTime: number): void {
    this.isRotating = isRotating;
    this.dragStartTime = dragStartTime;
  }

  getZoomBlockDuration(): number {
    return ZOOM_BLOCK_DURATION_MS;
  }

  private isZoomBlocked(): boolean {
    return this.isRotating || (performance.now() - this.dragStartTime < ZOOM_BLOCK_DURATION_MS);
  }

  setZoomGetter(getter: () => number): void {
    this.zoomGetter = getter;
  }

  private drawSpiralArc(centerX: number, centerY: number, fullCircles: number): void {
    if (fullCircles === 0) return;

    const baseRadius = SPIRAL_BASE_RADIUS;
    const radiusGrowth = SPIRAL_RADIUS_GROWTH;
    const segments = SPIRAL_SEGMENTS;

    // Positive fullCircles = clockwise = red
    // Negative fullCircles = counter-clockwise = blue
    const isClockwise = fullCircles > 0;
    const color = isClockwise ? TRAIL_CIRCLE_COLOR_POSITIVE : TRAIL_CIRCLE_COLOR_NEGATIVE;
    const absFullCircles = Math.abs(fullCircles);

    // Total angle to sweep (in radians)
    const totalAngle = absFullCircles * 2 * Math.PI;

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = SPIRAL_LINE_WIDTH;
    this.ctx.beginPath();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // Parameter from 0 to 1
      const angle = t * totalAngle;

      // For clockwise (positive), start at top and go clockwise (negative angle direction)
      // For counter-clockwise (negative), start at top and go counter-clockwise (positive angle direction)
      const startAngle = SPIRAL_START_ANGLE;
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
    this.trail = this.trail.filter(point => now - point.timestamp <= TRAIL_DURATION_MS);

    // Check if virtual touch point has expired
    if (this.virtualTouchPoint && now - this.virtualTouchPoint.timestamp > VIRTUAL_TOUCH_DURATION_MS) {
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
        this.ctx.fillStyle = signedArea > 0 ? TRAIL_TRIANGLE_COLOR_POSITIVE : TRAIL_TRIANGLE_COLOR_NEGATIVE;

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
      this.ctx.strokeStyle = TRAIL_STROKE_COLOR;
      this.ctx.lineWidth = TRAIL_LINE_WIDTH;
      this.ctx.beginPath();
      this.ctx.moveTo(this.trail[0].x, this.trail[0].y);

      for (let i = 1; i < this.trail.length; i++) {
        this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }

      this.ctx.stroke();
    }

    // Draw area circles - positioned at 1/3 width, vertically aligned with visualize checkbox
    if (currentPoint) {
      // Get position: at 1/3 width, vertically aligned with visualize checkbox
      const visualizeToggle = document.getElementById('visualize-toggle');
      const leftCircleX = this.canvas.width / AREA_CIRCLE_X_RATIO;
      const rightCircleX = this.canvas.width * 2 / AREA_CIRCLE_X_RATIO;
      let circleY = INDICATOR_CIRCLE_DEFAULT_Y;
      if (visualizeToggle) {
        const rect = visualizeToggle.getBoundingClientRect();
        circleY = rect.top + rect.height / 2; // Vertically centered with checkbox
      }

      // Draw green threshold circle (only visible before zoom activation)
      if (!this.zoomActivated) {
        const thresholdRadius = Math.sqrt(ZOOM_AREA_THRESHOLD) * INDICATOR_CIRCLE_SCALE;
        this.ctx.beginPath();
        this.ctx.arc(leftCircleX, circleY, thresholdRadius, 0, Math.PI * 2);
        if (this.isZoomBlocked()) {
          // Filled circle during zoom block period
          this.ctx.fillStyle = TRAIL_THRESHOLD_FILL_COLOR;
          this.ctx.fill();
        }
        this.ctx.strokeStyle = TRAIL_THRESHOLD_COLOR;
        this.ctx.lineWidth = INDICATOR_STROKE_WIDTH;
        this.ctx.stroke();
      }

      // Draw red/blue area circle on top (only when there's area)
      if (totalSignedArea !== 0) {
        const radius = Math.sqrt(Math.abs(totalSignedArea)) * INDICATOR_CIRCLE_SCALE;
        const color = totalSignedArea > 0 ? TRAIL_CIRCLE_COLOR_POSITIVE : TRAIL_CIRCLE_COLOR_NEGATIVE;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = INDICATOR_STROKE_WIDTH;
        this.ctx.beginPath();
        this.ctx.arc(leftCircleX, circleY, radius, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      // Draw swept angle spiral indicator
      const fullCircles = this.getFullCircles();
      if (fullCircles !== 0) {
        this.drawSpiralArc(leftCircleX, circleY, fullCircles);
      }

      // Draw product visualization (signedArea * fullCircles * (fullCirclesMult^2) * sign(signedArea)) at 2/3 width
      const signOfArea = totalSignedArea >= 0 ? 1 : -1;
      const compoundValMult = ZOOM_FULL_CIRCLES_MULT * ZOOM_FULL_CIRCLES_MULT;
      const product = totalSignedArea * fullCircles * compoundValMult * signOfArea;

      // Draw green threshold circle for Alt1 (only visible before Alt1 zoom activation)
      if (!this.alt1ZoomActivated) {
        const thresholdRadius = Math.sqrt(ZOOM_ALT1_THRESHOLD) * INDICATOR_CIRCLE_SCALE;
        this.ctx.beginPath();
        this.ctx.arc(rightCircleX, circleY, thresholdRadius, 0, Math.PI * 2);
        if (this.isZoomBlocked()) {
          // Filled circle during zoom block period
          this.ctx.fillStyle = TRAIL_THRESHOLD_FILL_COLOR;
          this.ctx.fill();
        }
        this.ctx.strokeStyle = TRAIL_THRESHOLD_COLOR;
        this.ctx.lineWidth = INDICATOR_STROKE_WIDTH;
        this.ctx.stroke();
      }

      if (product !== 0) {
        const productRadius = Math.sqrt(Math.abs(product)) * INDICATOR_CIRCLE_SCALE;
        const productColor = product > 0 ? TRAIL_CIRCLE_COLOR_POSITIVE : TRAIL_CIRCLE_COLOR_NEGATIVE;

        this.ctx.strokeStyle = productColor;
        this.ctx.lineWidth = INDICATOR_STROKE_WIDTH;
        this.ctx.beginPath();
        this.ctx.arc(rightCircleX, circleY, productRadius, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }

    // Draw the circle at drag point or virtual touch point
    if (currentPoint) {
      this.ctx.beginPath();
      this.ctx.arc(currentPoint.x, currentPoint.y, TRAIL_CIRCLE_RADIUS, 0, Math.PI * 2);
      this.ctx.fillStyle = TRAIL_FILL_COLOR;
      this.ctx.fill();
    }

    // Draw zoom factor
    if (this.zoomGetter) {
      const zoom = this.zoomGetter();
      const zoomText = zoom.toFixed(1);

      // Position at same height as native checkbox, right-aligned
      const nativeToggle = document.getElementById('visualize-toggle');
      let zoomY = 50; // Default fallback
      if (nativeToggle) {
        const rect = nativeToggle.getBoundingClientRect();
        zoomY = rect.top + rect.height / 2;
      }

      this.ctx.font = ZOOM_TEXT_FONT;
      this.ctx.fillStyle = ZOOM_TEXT_COLOR;
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(zoomText, this.canvas.width - ZOOM_TEXT_X_OFFSET, zoomY);
    }
  }

  clear(): void {
    this.trail = [];
    this.dragPoint = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  clearTrail(): void {
    this.trail = [];
  }

  destroy(): void {
    this.stopAnimation();
    this.clear();
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
}
