"use client";

interface SearchBarProps {
  marques: string[];
  modeles: string[];
  marque: string;
  modele: string;
  moteur: string;
  kmMax: number | null;
  prixMax: number | null;
  onField: (field: string, value: string | number | null) => void;
  onSearch: () => void;
}

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "7px",
  padding: ".48rem .7rem",
  fontSize: ".85rem",
  fontFamily: "DM Sans, sans-serif",
  color: "var(--navy)",
  background: "var(--white)",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: ".72rem",
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  marginBottom: ".35rem",
  display: "block",
};

/** Chaîne de champ entier (trim) : vide → null, sinon entier base 10. */
function optionalBase10IntFromString(value: string): number | null {
  const v = value.trim();
  if (v === "") return null;
  return Number.parseInt(v, 10);
}

export default function SearchBar({
  marques,
  modeles,
  marque,
  modele,
  moteur,
  kmMax,
  prixMax,
  onField,
  onSearch,
}: Readonly<SearchBarProps>) {
  return (
    <div
      style={{
        background: "var(--white)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "1.25rem 1.5rem",
        margin: "0 2rem",
        position: "relative",
        top: "-1.2rem",
        zIndex: 10,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "1rem",
        alignItems: "end",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: ".75rem",
        }}
      >
        {/* Marque */}
        <div>
          <label htmlFor="search-marque" style={labelStyle}>
            Marque
          </label>
          <select
            id="search-marque"
            style={selectStyle}
            value={marque}
            onChange={(e) => onField("marque", e.target.value)}
          >
            <option value="">Toutes</option>
            {marques.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Modèle */}
        <div>
          <label htmlFor="search-modele" style={labelStyle}>
            Modèle
          </label>
          <select
            id="search-modele"
            style={selectStyle}
            value={modele}
            onChange={(e) => onField("modele", e.target.value)}
          >
            <option value="">Tous</option>
            {modeles.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* Motorisation */}
        <div>
          <label htmlFor="search-moteur" style={labelStyle}>
            Motorisation
          </label>
          <select
            id="search-moteur"
            style={selectStyle}
            value={moteur}
            onChange={(e) => onField("moteur", e.target.value)}
          >
            <option value="">Toutes</option>
            <option>Essence</option>
            <option>Diesel</option>
            <option>Hybride</option>
            <option>Électrique</option>
          </select>
        </div>

        {/* Km max */}
        <div>
          <label htmlFor="search-km-max" style={labelStyle}>
            Km max
          </label>
          <select
            id="search-km-max"
            style={selectStyle}
            value={kmMax ?? ""}
            onChange={(e) =>
              onField("kmMax", optionalBase10IntFromString(e.target.value))
            }
          >
            <option value="">Tous</option>
            <option value="30000">— 30 000 km</option>
            <option value="60000">— 60 000 km</option>
            <option value="100000">— 100 000 km</option>
            <option value="150000">— 150 000 km</option>
          </select>
        </div>

        {/* Budget max */}
        <div>
          <label htmlFor="search-prix-max" style={labelStyle}>
            Budget max (€)
          </label>
          <input
            id="search-prix-max"
            type="number"
            style={selectStyle}
            placeholder="Ex: 25000"
            min={0}
            step={1000}
            value={prixMax ?? ""}
            onChange={(e) =>
              onField("prixMax", optionalBase10IntFromString(e.target.value))
            }
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSearch}
        style={{
          background: "var(--cyan)",
          color: "var(--white)",
          border: "none",
          borderRadius: "8px",
          padding: ".72rem 1.5rem",
          fontSize: ".9rem",
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "Syne, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        Rechercher
      </button>
    </div>
  );
}
