export default function ConstelacionOrion({ id, className = '', label = 'Constelación de Orión · asistente disponible' }) {
  return (
    <div id={id} className={`vai-face vai-face--idle vai-orion ${className}`.trim()} role="img" aria-label={label}>
      <svg className="vai-orion-map" viewBox="0 0 100 116" aria-hidden="true" focusable="false">
        <g className="vai-orion-lines">
          <path d="M50 10 25 30 39 54 28 96" />
          <path d="M50 10 73 29 62 50 72 98" />
          <path d="M25 30 73 29" />
          <path d="M39 54 50 52 62 50" />
          <path d="M50 52 50 66 48 78" />
        </g>
        <g className="vai-orion-stars">
          <circle className="vai-orion-star star-meissa" cx="50" cy="10" r="3.2" />
          <circle className="vai-orion-star star-betelgeuse" cx="25" cy="30" r="4.5" />
          <circle className="vai-orion-star star-bellatrix" cx="73" cy="29" r="3.7" />
          <circle className="vai-orion-star star-alnitak" cx="39" cy="54" r="3.2" />
          <circle className="vai-orion-star star-alnilam" cx="50" cy="52" r="3.5" />
          <circle className="vai-orion-star star-mintaka" cx="62" cy="50" r="3" />
          <circle className="vai-orion-star star-sword-one" cx="50" cy="66" r="2.2" />
          <circle className="vai-orion-star star-sword-two" cx="48" cy="78" r="2.5" />
          <circle className="vai-orion-star star-saiph" cx="28" cy="96" r="3.6" />
          <circle className="vai-orion-star star-rigel" cx="72" cy="98" r="4.7" />
        </g>
      </svg>
    </div>
  );
}
