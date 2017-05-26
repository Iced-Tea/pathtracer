const BLACK = new Vector3(0, 0, 0)

class Camera {
  constructor ({ canvas, scene, fov, bounces }) {
    const fovRadians = fov * Math.PI / 180;
    Object.assign(this, { scene, bounces })
    this.zoom = Math.tan(fovRadians / 2);
    this.origin = new Vector3()
    this.width = canvas.width
    this.height = canvas.height
    this.buffer = new Uint32Array(this.width * this.height * 4);
    this.context = canvas.getContext('2d')
    this.image = this.context.getImageData(0, 0, this.width, this.height)
    this.paths = 0
    this.pathsPerFrame = this.width * this.height
  }
  expose (scene) {
    const index = this._indexForPath(this.paths)
    const pixel = this._pixelForIndex(index)
    const ray = this._rayForPixel(pixel)
    const color = this._trace(ray, this.bounces)
    this._setPixel(pixel.x, pixel.y, color)
    this.paths++
  }
  draw (debug=false) {
    this.context.putImageData(this.image, 0, 0)
    if (debug) {
      const pixel = this.pixel
      this.context.fillStyle = '#fff'
      this.context.fillRect(0, pixel.y, this.width, 1)
    }
  }
  get aspect () {
    return this.width / this.height
  }
  _setPixel (x, y, color) {
    const index = (x + (y * this.width)) * 4
    const exposures = Math.ceil(this.paths / this.pathsPerFrame)
    const rgb = color.array
    for (let i = 0; i < 3; i++) {
      this.buffer[index + i] += rgb[i]
      this.image.data[index + i] = this._gamma(this.buffer[index + i] / exposures, 2.2)
    }
    this.image.data[index + 3] = 255
  }
  _gamma(brightness, g) {
    return Math.pow(brightness / 255, (1 / g)) * 255
  }
  get pixel () {
    const path = this.paths % this.pathsPerFrame
    const x = path % this.width
    const y = Math.floor(path / this.width)
    return { x, y }
  }
  _indexForPath (path) {
    return path % this.pathsPerFrame
  }
  _pixelForIndex (index) {
    const x = index % this.width
    const y = Math.floor(index / this.width)
    return { x, y }
  }
  _rayForPixel (pixel) {
    const viewX = (pixel.x + Math.random()) / this.width  // map pixel X to 0:1 with random jitter
    const viewY = (pixel.y + Math.random()) / this.height // map pixel Y to 0:1 with random jitter
    const screenX = (2 * viewX - 1) * this.aspect;  // map 0:1 to -aspect:aspect
    const screenY = (2 * viewY - 1) * -1;  // map 0:1 to 1:-1
    const direction = new Vector3(screenX * this.zoom, screenY * this.zoom, -1).normalized;
    return new Ray3(this.origin, direction)
  }
  _trace (ray, bounces, attenuation = 1) {
    if (bounces >= 0 && Math.random() <= attenuation) {
      const gain = 1 / attenuation
      const { hit, normal, material } = this.scene.intersect(ray)
      if (!hit) return this.scene.background(ray).scaledBy(gain)
      if (ray.direction.enters(normal)) {
        const samples = material.bsdf(ray.direction, normal)
        const light = samples.reduce((total, sample) => {
          const luminosity = sample.attenuation.scaledBy(sample.pdf)
          const sampleRay = new Ray3(hit, sample.direction)
          const sampleLight = this._trace(sampleRay, bounces - 1, sample.attenuation.max * attenuation)
          return total.plus(sampleLight.scaledBy(luminosity))
        }, material.light)
        return light.scaledBy(gain)
      }
      else {
        const direction = ray.direction.refracted(normal.scaledBy(-1), material.refraction, 1)
        const refractedRay = new Ray3(hit, direction)
        return this._trace(refractedRay, bounces - 1, attenuation).scaledBy(gain)
      }
    }
    return BLACK
  }
}
