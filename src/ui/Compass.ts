import { MapProvider } from '../map/types';

export class Compass {
  private container: HTMLElement;
  private mapProvider: MapProvider;
  private svgElement: SVGElement | null = null;
  private animationFrameId: number | null = null;

  constructor(container: HTMLElement, mapProvider: MapProvider) {
    this.container = container;
    this.mapProvider = mapProvider;
    this.render();
    this.startRotationSync();
  }

  private render(): void {
    this.container.innerHTML = `
      <button id="compass-btn" title="Reset to north">
        <svg width="32" height="32" viewBox="0 0 256 256" fill="none">
          <path stroke="#ff0000" stroke-width="21.362" stroke-linecap="round" d="M 95.203982,127.6524 127.15827,11.529893"/>
          <path stroke="#ff0000" stroke-width="21.362" stroke-linecap="round" d="M 161.01459,128.7877 127.14936,11.585457"/>
          <path stroke="#ffffff" stroke-width="21.362" stroke-linecap="round" d="M 127.84512,244.13703 161.0207,129.05104"/>
          <path stroke="#ffffff" stroke-width="21.362" stroke-linecap="round" d="M 127.84512,243.80761 95.231994,129.20234"/>
          <path fill="#ff0000" d="M 84.070025,128.39774 172.08246,127.84294 127.04179,1.6265562 Z"/>
          <path fill="#ffffff" d="M 84.082097,128.16698 172.04416,127.80134 127.51402,254.9273 Z"/>
        </svg>
      </button>
    `;

    this.svgElement = this.container.querySelector('#compass-btn svg');

    this.container.querySelector('#compass-btn')!.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.resetToNorth();
    });
  }

  private startRotationSync(): void {
    const updateRotation = () => {
      if (this.svgElement) {
        const rotation = this.mapProvider.getRotation();
        // Rotate the compass in the opposite direction to always point north
        this.svgElement.style.transform = `rotate(${rotation}deg)`;
      }
      this.animationFrameId = requestAnimationFrame(updateRotation);
    };
    this.animationFrameId = requestAnimationFrame(updateRotation);
  }

  private resetToNorth(): void {
    this.mapProvider.setRotation(0, true);
  }

  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.container.innerHTML = '';
  }
}
