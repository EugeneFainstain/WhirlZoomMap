/**
 * EdgeIndicator - Shows colored vertical bars sliding in from screen edges
 * when the user drags near the edges during single-finger map dragging.
 *
 * Right edge: red bar on top, blue bar on bottom
 * Left edge: blue bar on top, red bar on bottom
 */
export class EdgeIndicator {
  private container: HTMLElement;

  // Bar elements
  private rightTopBar: HTMLElement;
  private rightBottomBar: HTMLElement;
  private leftTopBar: HTMLElement;
  private leftBottomBar: HTMLElement;

  // Configuration
  private readonly gapSize = 8; // Gap between top and bottom bars in pixels

  // Current rotation rate (positive = CW, negative = CCW)
  private currentRotationRate: number = 0;

  // Rotation animation state
  private rotationAnimationId: number | null = null;
  private rotationCallback: ((rate: number) => void) | null = null;
  private rotationStopCallback: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // Create bar elements
    this.rightTopBar = this.createBar('red');
    this.rightBottomBar = this.createBar('blue');
    this.leftTopBar = this.createBar('blue');
    this.leftBottomBar = this.createBar('red');

    // Position bars
    this.positionBars();

    // Add to container
    this.container.appendChild(this.rightTopBar);
    this.container.appendChild(this.rightBottomBar);
    this.container.appendChild(this.leftTopBar);
    this.container.appendChild(this.leftBottomBar);

    // Handle resize
    window.addEventListener('resize', this.positionBars);
  }

  /**
   * Set a callback that will be called continuously while rotation is active
   */
  setRotationCallback(callback: (rate: number) => void, onStop?: () => void): void {
    this.rotationCallback = callback;
    this.rotationStopCallback = onStop ?? null;
  }

  private createBar(color: 'red' | 'blue'): HTMLElement {
    const bar = document.createElement('div');
    bar.style.position = 'absolute';
    bar.style.backgroundColor = color === 'red' ? '#ff4444' : '#4444ff';
    bar.style.pointerEvents = 'none';
    bar.style.zIndex = '1000';
    bar.style.opacity = '0.8';
    bar.style.transition = 'none'; // We'll animate via transform
    return bar;
  }

  private positionBars = (): void => {
    const rect = this.container.getBoundingClientRect();
    const barWidth = Math.max(2, Math.floor(rect.width / 64));
    const halfHeight = (rect.height - this.gapSize) / 2;

    // Right side bars - positioned off-screen initially
    this.rightTopBar.style.right = `-${barWidth}px`;
    this.rightTopBar.style.top = '0';
    this.rightTopBar.style.width = `${barWidth}px`;
    this.rightTopBar.style.height = `${halfHeight}px`;

    this.rightBottomBar.style.right = `-${barWidth}px`;
    this.rightBottomBar.style.bottom = '0';
    this.rightBottomBar.style.width = `${barWidth}px`;
    this.rightBottomBar.style.height = `${halfHeight}px`;

    // Left side bars - positioned off-screen initially
    this.leftTopBar.style.left = `-${barWidth}px`;
    this.leftTopBar.style.top = '0';
    this.leftTopBar.style.width = `${barWidth}px`;
    this.leftTopBar.style.height = `${halfHeight}px`;

    this.leftBottomBar.style.left = `-${barWidth}px`;
    this.leftBottomBar.style.bottom = '0';
    this.leftBottomBar.style.width = `${barWidth}px`;
    this.leftBottomBar.style.height = `${halfHeight}px`;
  };

  /**
   * Update the edge indicators based on finger position during drag
   * @param fingerX - The X coordinate of the finger (client coordinates)
   * @param fingerY - The Y coordinate of the finger (client coordinates)
   * @param isDragging - Whether a single-finger drag is in progress
   */
  update(fingerX: number, fingerY: number, isDragging: boolean): void {
    if (!isDragging) {
      this.hide();
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const barWidth = Math.max(2, Math.floor(rect.width / 64));

    // Calculate thresholds
    const startThreshold = rect.width / 8;  // Start sliding in at 1/8 from edge
    const endThreshold = rect.width / 16;   // Fully visible at 1/16 from edge

    // Distance from edges (relative to container)
    const distanceFromRight = rect.right - fingerX;
    const distanceFromLeft = fingerX - rect.left;

    // Calculate progress for right edge (0 = not visible, 1 = fully visible)
    let rightProgress = 0;
    if (distanceFromRight <= startThreshold) {
      rightProgress = 1 - (distanceFromRight - endThreshold) / (startThreshold - endThreshold);
      rightProgress = Math.max(0, Math.min(1, rightProgress));
    }

    // Calculate progress for left edge
    let leftProgress = 0;
    if (distanceFromLeft <= startThreshold) {
      leftProgress = 1 - (distanceFromLeft - endThreshold) / (startThreshold - endThreshold);
      leftProgress = Math.max(0, Math.min(1, leftProgress));
    }

    // Apply transforms - slide in from the edge
    // Right bars: translate from barWidth (off-screen) to 0 (on-screen)
    const rightOffset = barWidth * (1 - rightProgress);
    this.rightTopBar.style.transform = `translateX(-${barWidth - rightOffset}px)`;
    this.rightBottomBar.style.transform = `translateX(-${barWidth - rightOffset}px)`;

    // Left bars: translate from -barWidth (off-screen) to 0 (on-screen)
    const leftOffset = barWidth * (1 - leftProgress);
    this.leftTopBar.style.transform = `translateX(${barWidth - leftOffset}px)`;
    this.leftBottomBar.style.transform = `translateX(${barWidth - leftOffset}px)`;

    // Calculate rotation rate - full speed when within 1/16th from edge
    const rotationThreshold = rect.width / 16;

    const rightRotationActive = distanceFromRight <= rotationThreshold;
    const leftRotationActive = distanceFromLeft <= rotationThreshold;

    // Red bars = CW (positive), Blue bars = CCW (negative)
    // Right: top=red(CW), bottom=blue(CCW)
    // Left: top=blue(CCW), bottom=red(CW)
    const centerY = rect.top + rect.height / 2;
    const isTopHalf = fingerY < centerY;

    this.currentRotationRate = 0;
    if (rightRotationActive) {
      // Near right edge: top=red(CW), bottom=blue(CCW)
      this.currentRotationRate = isTopHalf ? 1 : -1;
    } else if (leftRotationActive) {
      // Near left edge: top=blue(CCW), bottom=red(CW)
      this.currentRotationRate = isTopHalf ? -1 : 1;
    }

    // Start or stop the rotation animation loop
    if (this.currentRotationRate !== 0 && this.rotationAnimationId === null) {
      this.startRotationLoop();
    } else if (this.currentRotationRate === 0 && this.rotationAnimationId !== null) {
      this.stopRotationLoop();
    }
  }

  private startRotationLoop(): void {
    const animate = () => {
      if (this.currentRotationRate !== 0 && this.rotationCallback) {
        this.rotationCallback(this.currentRotationRate);
      }

      if (this.currentRotationRate !== 0) {
        this.rotationAnimationId = requestAnimationFrame(animate);
      } else {
        this.rotationAnimationId = null;
      }
    };

    this.rotationAnimationId = requestAnimationFrame(animate);
  }

  private stopRotationLoop(): void {
    if (this.rotationAnimationId !== null) {
      cancelAnimationFrame(this.rotationAnimationId);
      this.rotationAnimationId = null;
      if (this.rotationStopCallback) {
        this.rotationStopCallback();
      }
    }
  }

  /**
   * Get the current rotation rate based on finger proximity to edge bars
   * @returns Rotation rate: positive = clockwise, negative = counter-clockwise, 0 = no rotation
   */
  getRotationRate(): number {
    return this.currentRotationRate;
  }

  /**
   * Hide all edge indicators immediately
   */
  hide(): void {
    // Reset transforms - bars return to their CSS positions (off-screen)
    this.rightTopBar.style.transform = '';
    this.rightBottomBar.style.transform = '';
    this.leftTopBar.style.transform = '';
    this.leftBottomBar.style.transform = '';
    this.currentRotationRate = 0;
    this.stopRotationLoop();
  }

  destroy(): void {
    this.stopRotationLoop();
    window.removeEventListener('resize', this.positionBars);
    this.rightTopBar.remove();
    this.rightBottomBar.remove();
    this.leftTopBar.remove();
    this.leftBottomBar.remove();
  }
}
