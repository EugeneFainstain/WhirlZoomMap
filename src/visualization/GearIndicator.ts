/**
 * GearIndicator - Shows a gear icon at the map anchor position
 * when the finger approaches the screen edges during single-finger drag.
 *
 * The gear fades in as the finger gets closer to any edge:
 * - Starts fading in at 1/8th of screen width from the edge
 * - Fully visible at 1/16th of screen width from the edge
 */
export class GearIndicator {
  private container: HTMLElement;
  private gearElement: HTMLElement;
  private gearFillGroup: SVGGElement | null = null;
  private isVisible: boolean = false;
  private isInRotationZone: boolean = false;

  // Gear SVG markup (embedded for performance)
  private static readonly GEAR_SVG = `<svg width="144" height="144" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <g fill="#333333">
      <path d="M471.46,212.99l-42.07-7.92c-3.63-12.37-8.58-24.3-14.79-35.64l24.16-35.37c4.34-6.35,3.54-14.9-1.9-20.34l-38.58-38.58c-5.44-5.44-13.99-6.24-20.34-1.9L342.57,97.4c-11.34-6.21-23.27-11.16-35.64-14.78l-7.92-42.07c-1.42-7.56-8.03-13.04-15.72-13.04h-54.57c-7.69,0-14.3,5.48-15.72,13.04l-7.92,42.07c-12.37,3.63-24.3,8.58-35.64,14.78l-35.37-24.16c-6.35-4.34-14.9-3.54-20.34,1.9l-38.58,38.58c-5.44,5.44-6.24,13.98-1.9,20.34l24.16,35.37c-6.21,11.34-11.16,23.27-14.79,35.64l-42.07,7.92c-7.56,1.42-13.04,8.03-13.04,15.72v54.57c0,7.69,5.48,14.3,13.04,15.72l42.07,7.92c3.63,12.37,8.58,24.3,14.79,35.64l-24.16,35.37c-4.34,6.35-3.54,14.9,1.9,20.34l38.58,38.58c5.44,5.44,13.99,6.24,20.34,1.9l35.37-24.16c11.34,6.21,23.27,11.16,35.64,14.79l7.92,42.07c1.42,7.56,8.03,13.04,15.72,13.04h54.57c7.69,0,14.3-5.48,15.72-13.04l7.92-42.07c12.37-3.63,24.3-8.58,35.64-14.79l35.37,24.16c6.35,4.34,14.9,3.54,20.34-1.9l38.58-38.58c5.44-5.44,6.24-13.98,1.9-20.34l-24.16-35.37c6.21-11.34,11.16-23.27,14.79-35.64l42.07-7.92c7.56-1.42,13.04-8.03,13.04-15.72v-54.57C484.5,221.02,479.02,214.42,471.46,212.99z M452.5,270.01l-38.98,7.34c-6.25,1.18-11.21,5.94-12.63,12.14c-3.69,16.02-10,31.25-18.77,45.25c-3.37,5.39-3.24,12.26,0.35,17.51l22.39,32.78l-19.82,19.82l-32.78-22.39c-5.25-3.59-12.12-3.73-17.51-0.35c-14.01,8.77-29.24,15.08-45.25,18.77c-6.2,1.43-10.96,6.38-12.14,12.63l-7.34,38.98h-28.03l-7.34-38.98c-1.18-6.25-5.94-11.21-12.14-12.63c-16.02-3.69-31.24-10-45.25-18.77c-5.39-3.37-12.26-3.24-17.51,0.35l-32.78,22.39l-19.82-19.82l22.39-32.78c3.59-5.25,3.72-12.12,0.35-17.51c-8.77-14.01-15.08-29.24-18.77-45.25c-1.43-6.2-6.38-10.96-12.63-12.14l-38.98-7.34v-28.03l38.98-7.34c6.25-1.18,11.21-5.94,12.63-12.14c3.69-16.02,10-31.25,18.77-45.25c3.37-5.39,3.24-12.26-0.35-17.51l-22.39-32.78l19.82-19.82l32.78,22.39c5.25,3.58,12.12,3.72,17.51,0.35c14.01-8.77,29.24-15.08,45.25-18.77c6.2-1.43,10.96-6.38,12.14-12.63l7.34-38.98h28.03l7.34,38.98c1.18,6.25,5.94,11.21,12.14,12.63c16.02,3.69,31.24,10,45.25,18.77c5.39,3.37,12.26,3.24,17.51-0.35l32.78-22.39l19.82,19.82l-22.39,32.78c-3.59,5.25-3.72,12.12-0.35,17.51c8.77,14.01,15.08,29.24,18.77,45.25c1.43,6.2,6.38,10.96,12.63,12.14l38.98,7.34V270.01z"/>
      <path d="M256,148.26c-59.41,0-107.74,48.33-107.74,107.74c0,59.41,48.33,107.74,107.74,107.74S363.74,315.41,363.74,256C363.74,196.59,315.41,148.26,256,148.26z M256,331.74c-41.76,0-75.74-33.98-75.74-75.74c0-41.76,33.98-75.74,75.74-75.74s75.74,33.98,75.74,75.74C331.74,297.76,297.76,331.74,256,331.74z"/>
    </g>
  </svg>`;

  constructor(container: HTMLElement) {
    this.container = container;

    // Create the gear element
    this.gearElement = document.createElement('div');
    this.gearElement.innerHTML = GearIndicator.GEAR_SVG;
    this.gearElement.style.position = 'absolute';
    this.gearElement.style.pointerEvents = 'none';
    this.gearElement.style.zIndex = '999';
    this.gearElement.style.opacity = '0';
    this.gearElement.style.transform = 'translate(-50%, -50%)';
    this.gearElement.style.transition = 'opacity 0.1s ease-out';

    this.container.appendChild(this.gearElement);

    // Get reference to the SVG fill group for color changes
    this.gearFillGroup = this.gearElement.querySelector('g');
  }

  /**
   * Update the gear indicator based on finger position and anchor position
   * @param fingerX - The X coordinate of the finger (client coordinates)
   * @param fingerY - The Y coordinate of the finger (client coordinates)
   * @param anchorScreenX - The X coordinate of the map anchor on screen (relative to container)
   * @param anchorScreenY - The Y coordinate of the map anchor on screen (relative to container)
   * @param isDragging - Whether a single-finger drag is in progress
   * @param rotationDegrees - The current map rotation in degrees (optional)
   */
  update(
    fingerX: number,
    fingerY: number,
    anchorScreenX: number,
    anchorScreenY: number,
    isDragging: boolean,
    rotationDegrees: number = 0
  ): void {
    if (!isDragging) {
      this.hide();
      return;
    }

    const rect = this.container.getBoundingClientRect();

    // Calculate thresholds based on screen width
    const startThreshold = rect.width / 8;  // Start fading in at 1/8 from edge
    const endThreshold = rect.width / 16;   // Fully visible at 1/16 from edge

    // Distance from left/right edges only (gear rotation only works on horizontal edges)
    const distanceFromRight = rect.right - fingerX;
    const distanceFromLeft = fingerX - rect.left;

    // Find the minimum distance to left or right edge
    const minDistance = Math.min(distanceFromRight, distanceFromLeft);

    // Calculate opacity based on proximity to edge
    // 0 opacity when distance >= startThreshold
    // 1 opacity when distance <= endThreshold
    let opacity = 0;
    if (minDistance <= startThreshold) {
      opacity = 1 - (minDistance - endThreshold) / (startThreshold - endThreshold);
      opacity = Math.max(0, Math.min(1, opacity));
    }

    // Update gear position (anchor position relative to container)
    this.gearElement.style.left = `${anchorScreenX}px`;
    this.gearElement.style.top = `${anchorScreenY}px`;

    // Update transform with centering and rotation
    this.gearElement.style.transform = `translate(-50%, -50%) rotate(${rotationDegrees}deg)`;

    // Update opacity
    this.gearElement.style.opacity = String(opacity);
    this.isVisible = opacity > 0;

    // Update color based on whether we're in the rotation zone
    const inRotationZone = minDistance <= endThreshold;
    if (inRotationZone !== this.isInRotationZone) {
      this.isInRotationZone = inRotationZone;
      if (this.gearFillGroup) {
        this.gearFillGroup.setAttribute('fill', inRotationZone ? '#22c55e' : '#333333');
      }
    }
  }

  /**
   * Hide the gear indicator immediately
   */
  hide(): void {
    this.gearElement.style.opacity = '0';
    this.isVisible = false;
  }

  /**
   * Check if the gear is currently visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Clean up the indicator
   */
  destroy(): void {
    this.gearElement.remove();
  }
}
