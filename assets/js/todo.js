(function() {

	const template = document.createElement('template');
	template.innerHTML = `
		<style>
			:host {
				width: 100%;
				border-radius: 5px;
				background-color: rgb(255,165,0);
				color: white;
				clear: both;
				display: block;
				padding: 8px 16px 8px 16px;
			}
			.title {
				color: black;
				display: block;
				clear: both;
				font-weight: bold;
			}
		</style>
	`;

	class TodoNote extends HTMLElement {
		constructor() {
			super();
			this.attachShadow({mode: 'open'});
			this.shadowRoot.appendChild(template.content.cloneNode(true));
		}

		connectedCallback() {
			const span = document.createElement('span');
			const text = this.getAttribute('text');
			span.textContent = text;

			const title = document.createElement('span');
			title.textContent = "TODO:";
			title.setAttribute("class", "title");

			this.shadowRoot.appendChild(title);
			this.shadowRoot.appendChild(span);
		}
	}

	window.customElements.define('to-do', TodoNote);
})();