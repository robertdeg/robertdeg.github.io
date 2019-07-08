(function() {
	const template = document.createElement('template');

	let __shapes = {
		rectangle: null,
		circle:  null
	};

	class Point2D {
		constructor(x, y, xIsRelative, yIsRelative) {
			this.x = x;
			this.y = y;
			this.xIsRelative = xIsRelative || false;
			this.yIsRelative = yIsRelative || false;
		}

		plus(pt) {
			return new Point2D(this.x + pt.x, this.y + pt.y);
		}

		minus(pt) {
			return new Point2D(this.x - pt.x, this.y - pt.y);
		}

		normalize(srcPt) {
			return new Point2D(
				this.x + xIsRelative ? srcPt.x : 0,
				this.y + yIsRelative ? srcPt.y : 0,
				false, false);
		}
	}

	class NodeAnchor {
		constructor(name, anchor) {
			this.name = name;
			this.anchor = anchor || "center";
		}
	}

	function parseCSSLengths(s) {
		let regex_px_length = /([-+]?[0-9]*\.?[0-9]+)px/g;
		let result = [];
		var match = regex_px_length.exec(s);
		while (match != null) {
			result.push(parseFloat(match[1]));
			match = regex_px_length.exec(s);
		}
		return result;
	}

	function parseStringAsFloat(s) {
		let regex_float = /([-+]?[0-9]*\.?[0-9]+)/;
		let match = regex_float.exec(s);
		if (match)
			return parseFloat(match[1]);
		else
			return null;
	}

	function parseNodeReference(s) {
		let regex_coordinate_list = /(?:([-+]?[0-9]*\.?[0-9]+)(R|r)?\s+([-+]?[0-9]*\.?[0-9]+)(R|r)?)+/g;
		let regex_noderef = /([^\.]+)(?:\.(.+))?/g;

		let result = [];
		var match = regex_coordinate_list.exec(s);
		if (match) {
			while (match) {
				let x = parseFloat(match[1]);
				let xIsRelative = match[2];
				let y = parseFloat(match[3]);
				let yIsRelative = match[4];
				if (isFinite(x) && isFinite(y))
					result.push(new Point2D(x, y, xIsRelative, yIsRelative));

				if (result.length > 5)
					break;

				match = regex_coordinate_list.exec(s);
			}
		}
		else if (match = regex_noderef.exec(s)) {
			result.push(new NodeAnchor(match[1], match[2]));
		}

		return result;
	}

	template.innerHTML = `
		<canvas>
		</canvas>
		<style>
			:host {
				width: 24px;
				height: 24px;
			}
		</style>
	`;

	class TikzElement extends HTMLElement {
		constructor() {
			super();
		}

		get parentPath() {
			var parent = this.parentElement;
			while (parent) {
				if (parent instanceof TikzLine)
					return parent;
				else if (parent instanceof TikzCurve)
					return parent;
				else
					parent = parent.parentElement;
			}
			return null;
		}

		get tikzContext() {
			var parent = this.parentElement;
			while (parent) {
				if (parent instanceof TikzContext)
					return parent;

				parent = parent.parentElement;
			}
			return null;
		}

		*tikzChildren() {
			var q = [];
			for (let child of this.children) {
				q.push(child);
			}

			while (q.length > 0) {
				let v = q.pop();
				if (v instanceof TikzElement) {
					yield v;
				}
				for (let child of v.children) {
					q.push(child);
				}
			}
		}

		resolveNode(pt) {
			if (pt instanceof Point2D) {
				return pt;
			}
			else if (pt instanceof NodeAnchor) {
				let node = this.tikzContext.lookupNode(pt.name);
				if (node && node.position) {
					if (pt.anchor && node.shape && node.shape in __shapes) {
						// lookup anchor in shape
						let shape = __shapes[node.shape];
						let subNode = shape.lookupNode(pt.anchor);
						if (!subNode.position) {
							console.log("node '%s.%s' has no position", pt.name, pt.anchor);
						}
						if (node.anchor) {
							let anchor = shape.lookupNode(node.anchor);
							return subNode.position.plus(node.position).minus(anchor.position);
						}
						return subNode.position.plus(node.position);
					}
					return node.position;
				}
				else if (!node)
					console.log("node '%s' not found", pt.name);
				else if (!node.position)
					console.log("node '%s' has no position", pt.name);
			}
			return null;
		}

		beginDraw(context) {
		}

		endDraw(context) {

		}
	}

	class TikzContext extends TikzElement {
		constructor() {
			super();
			this.nodes = {};
		}

		registerNode(name, obj) {
			this.nodes[name] = obj;
		}

		lookupNode(name) {
			return this.nodes[name];
		}

		draw(context) {
			var q = [{node: this, visited: false}];

			while (q.length > 0) {
				let v = q[q.length - 1];
				if (v.visited) {
					if (v.node instanceof TikzElement && v.node.endDraw) {
						v.node.endDraw(context);
					}
					q.pop();
					continue;
				}

				v.visited = true;
				if (v.node instanceof TikzElement) {
					if (v.node.beginDraw) {
						v.node.beginDraw(context);
					}
				}
				let cs = [];
				for (let child of v.node.children) {
					cs.push(child);
				}
				cs.reverse();
				for (let child of cs) {
					// console.log("Pushing element %s with innerHTML %s", child, child.innerHTML);
					q.push({node: child, visited: false});
				}
			}
		}
	}

	class TikzFigure extends TikzContext {
		constructor() {
			super();
			this.attachShadow({mode: 'open'});

			this.canvas = document.createElement('canvas');
			this.shadowRoot.appendChild(template.content.cloneNode(true));
			this.shadowRoot.appendChild(this.canvas);
		}

		connectedCallback() {
			this.canvas.width = this.getAttribute("width") || 300;
			this.canvas.height = this.getAttribute("height") || 150;
			this.update();
		}

		get context2d() {
			return this.canvas.getContext("2d");
		}

		update() {
			let context = this.canvas.getContext("2d");
			context.clearRect(0, 0, this.canvas.width, this.canvas.height);
			this.draw(context);
		}
	}

	class TikzNode extends TikzElement {
		constructor() {
			super();
		}

		connectedCallback() {
			if (this.hasAttribute('at')) {
				this.absolutePosition = parseNodeReference(this.getAttribute('at'))[0];
			}
			if (this.hasAttribute('shape')) {
				this.shape = this.getAttribute('shape');
			}
			if (this.hasAttribute('anchor')) {
				this.anchor = this.getAttribute('anchor');
			}
			if (this.hasAttribute('label')) {
				// register the node in the figure
				console.log("Registering node '%s'", this.getAttribute('label'));
				this.tikzContext.registerNode(this.getAttribute('label'), this);
			}
			if (this.hasAttribute('pos')) {
				this.curvePosition = parseStringAsFloat(this.getAttribute('pos'));
			}
		}

		get position() {
			if (this.absolutePosition)
				return this.absolutePosition;
			else if (this.curvePosition) {
				return this.positionOnCurve(this.curvePosition);
			}
		}

		positionOnCurve(t) {
			// get curve
			let path = this.parentPath;
			if (path && path.getRelativePosition) {
				return path.getRelativePosition(t);
			}
			else
				return null;
		}

		beginDraw(context) {
			if (this.position instanceof Point2D) {

				context.save();

				// draw the shape
				if (this.shape) {
					let shape = __shapes[this.shape];

					context.save();

					// translate the shape
					context.translate(this.position.x, this.position.y);

					if (this.anchor) {
						// lookup the position of the anchor in the shape
						let anchor = shape.lookupNode(this.anchor);
						if (anchor.position instanceof Point2D) {
							context.translate(-anchor.position.x, -anchor.position.y);
						}
					}

					// draw the shape
					shape.draw(context);

					context.restore();
				}

				// draw the contents
				let txt = this.innerHTML || "";
				if (txt) {
					context.setLineDash([]);
					context.font = "20px Verdana";
					context.lineWidth = 0.5;
					context.textAlign = "center";
					context.textBaseline = "middle";
					context.fillText(txt, this.position.x, this.position.y);
				}

				let inner_sep = 1;
				let font = context.font;
				let height = parseInt(font.match(/\d+/), 10) + 2 * inner_sep;
				let width = context.measureText(txt).width + 2 * inner_sep;

				context.strokeStyle = 'black';
				context.lineWidth = 0.5;
				// context.strokeRect(this.position.x - width / 2, this.position.y - height / 2, width, height);
			}
		}

		endDraw(context) {
			context.restore();
		}
	}

	/* A TikzShape represents a basic shape that can be used to form nodes
	 * 
	 */
	class TikzShape extends TikzContext {
		constructor() {
			super();
			this.attachShadow({mode: 'open'});
		}

		connectedCallback() {
		}

		resolveAnchor(name) {

		}
	}

	class TikzPath extends TikzElement {
		constructor() {
			super();
			this.fromPoint = null;
		}

		connectedCallback() {
			if (this.hasAttribute('from')) {
				// this.resolveSource(this.getAttribute('from'));
				let pts = parseNodeReference(this.getAttribute('from'));
				if (pts.length == 1) {
					this.fromPoint = pts[0];
				}
			}
		}

		beginDraw(context) {
			// draw the path
			// move to fromPoint
			if (this.fromPoint) {
				let pos = this.resolveNode(this.fromPoint);
				if (pos) {
					context.beginPath();
					context.moveTo(pos.x, pos.y);
				}
			}
		}

		endDraw(context) {
			let style = getComputedStyle(this);
			if (style.stroke) {
				context.strokeStyle = style.stroke;
			}
			if (style["stroke-width"]) {
				let w = parseCSSLengths(style["stroke-width"])[0];
				context.lineWidth = w;
			}
			if (style["stroke-dasharray"]) {
				let w = parseCSSLengths(style["stroke-dasharray"]);
				context.setLineDash(w);
			}
			context.stroke();
		}
	}

	class TikzPathSegment extends TikzElement {
		constructor() {
			super();
		}
	}

	class TikzLine extends TikzPathSegment {
		constructor() {
			super();
		}

		connectedCallback() {
			if (this.hasAttribute('to')) {
				// this.resolveSource(this.getAttribute('from'));
				 let pts = parseNodeReference(this.getAttribute('to'));
				 this.toPoint = pts[0];
			}
		}

		beginDraw(context) {
			if (this.toPoint) {
				let pos = this.resolveNode(this.toPoint);
				if (pos) {
					context.lineTo(pos.x, pos.y);
				}
			}
		}
	}

	class TikzCurve extends TikzPathSegment {
		constructor() {
			super();
		}

		connectedCallback() {
			if (this.hasAttribute('controls')) {
				// this.resolveSource(this.getAttribute('from'));
				this.controlPoints = parseNodeReference(this.getAttribute('controls'));
			}
			if (this.hasAttribute('to')) {
				this.toPoint = parseNodeReference(this.getAttribute('to'))[0];
			}
		}

		drawQuadratic(context, control, dest) {
			context.quadraticCurveTo(control.x, control.y, dest.x, dest.y);
		}

		drawCubic(context, control1, control2, dest) {
			context.bezierCurveTo(control1.x, control1.y, control2.x, control2.y, dest.x, dest.y);
		}

		getRelativeQPosition(t) {
			if (this.parentElement && this.parentElement instanceof TikzPath) {
				var sp = this.parentElement.fromPoint;
				if (this.previousElementSibling && this.previousElementSibling instanceof TikzPathSegment) {
					sp = this.previousElementSibling.fromPoint;
				}
				let cp = this.controlPoints[0];
				let ep = this.toPoint;

				const t1 = 1 - t;
				const x = t1 * t1 * sp.x + 2 * t1 * t * cp.x + t * t * ep.x;
				const y = t1 * t1 * sp.y + 2 * t1 * t * cp.y + t * t * ep.y;

				return new Point2D(x, y);
			}
		}

		getRelativeCPosition(t) {
			if (this.parentElement && this.parentElement instanceof TikzPath) {
				var sp = this.parentElement.fromPoint;
				if (this.previousElementSibling && this.previousElementSibling instanceof TikzPathSegment) {
					sp = this.previousElementSibling.fromPoint;
				}
				let cp1 = this.controlPoints[0];
				let cp2 = this.controlPoints[1];
				let ep = this.toPoint;

				const t1 = 1 - t;
				const x = t1 * t1 * t1 * sp.x + 3 * t1 * t1 * t * cp1.x + 3 * t1 * t * t * cp2.x + t * t * t * ep.x; 
				const y = t1 * t1 * t1 * sp.y + 3 * t1 * t1 * t * cp1.y + 3 * t1 * t * t * cp2.y + t * t * t * ep.y; 
				return new Point2D(x, y);
			}
		}

		getRelativePosition(t) {
			if (this.controlPoints) {
				switch (this.controlPoints.length) {
					case 1:
						return this.getRelativeQPosition(t);
					case 2:
						return this.getRelativeCPosition(t);
				}
			}
			return null;
		}

		beginDraw(context) {
			if (this.toPoint instanceof Point2D) {
				switch (this.controlPoints.length) {
					case 1:
						this.drawQuadratic(context, this.controlPoints[0], this.toPoint);
						break;
					case 2:
						this.drawCubic(context, this.controlPoints[0], this.controlPoints[1], this.toPoint);
						break;
				}
			}
		}
	}

	function drawFigure(value) {
		if (value instanceof TikzFigure) {
			value.update();
		}
	}

	function drawTheFigures() {
		var shapes = document.getElementsByTagName('tikz-shape');
		for (let shape of shapes) {
			if (shape.hasAttribute('name')) {
				__shapes[shape.getAttribute('name')] = shape;
			}
		}

		var figures = document.getElementsByTagName('tikz-svg');
		for (let figure of figures) {
			drawFigure(figure);
		}
	}

	window.customElements.define('tikz-svg', TikzFigure);
	window.customElements.define('tikz-node', TikzNode);
	window.customElements.define('tikz-line', TikzLine);
	window.customElements.define('tikz-curve', TikzCurve);
	window.customElements.define('tikz-shape', TikzShape);
	window.customElements.define('tikz-path', TikzPath);

	window.addEventListener('load', drawTheFigures);
})();