"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Vehicle } from "@/types";

interface VehicleModalProps {
  vehicle: Vehicle | null;
  onClose: () => void;
  onDossier: (v: Vehicle, type: "lld" | "achat") => void;
}

export default function VehicleModal({
  vehicle: v,
  onClose,
  onDossier,
}: Readonly<VehicleModalProps>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKey);
    document.body.classList.toggle("modal-open", !!v);
    return () => {
      globalThis.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [v, onClose]);

  if (!v) return null;

  const specRows = [
    ["Kilométrage", v.km.toLocaleString("fr-FR") + " km"],
    ["Carburant", v.specs.carburant],
    ["Boîte de vitesses", v.specs.boite],
    ["Puissance", v.specs.puissance],
    ["Couleur", v.specs.couleur],
    ["Places", `${v.specs.places} places`],
  ] as const;

  return (
    /* Backdrop : fond = bouton natif plein écran, panneau au-dessus (z-index) */
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <button
        type="button"
        aria-label="Fermer la modale"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: "none",
          padding: 0,
          margin: 0,
          background: "rgba(0,0,0,.55)",
          cursor: "pointer",
        }}
      />
      {/* Modal panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "var(--white)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "820px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.3)",
        }}
      >
        {/* Header image */}
        <div
          style={{
            position: "relative",
            height: "280px",
            overflow: "hidden",
            background: "#0D1B4B",
          }}
        >
          <Image
            src={v.img}
            alt={`${v.make} ${v.model}`}
            fill
            style={{ objectFit: "cover", opacity: 0.85 }}
            sizes="820px"
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(to top,rgba(13,27,75,.85) 0%,transparent 55%)",
            }}
          />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              background: "rgba(255,255,255,.15)",
              border: "none",
              color: "#fff",
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>

          {/* Badge */}
          <div
            style={{
              position: "absolute",
              top: "1rem",
              left: "1rem",
              padding: ".3rem .7rem",
              borderRadius: "5px",
              fontSize: ".72rem",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: ".35rem",
              ...(v.lld
                ? {
                    background: "#E6F1FB",
                    color: "#0C447C",
                    border: "1px solid #85B7EB",
                  }
                : {
                    background: "#EAF3DE",
                    color: "#27500A",
                    border: "1px solid #C0DD97",
                  }),
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: v.lld ? "#185FA5" : "#639922",
              }}
            />
            {v.lld ? "LLD disponible" : "Achat uniquement"}
          </div>

          {/* Title */}
          <div
            style={{
              position: "absolute",
              bottom: "1rem",
              left: "1.5rem",
              right: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: ".75rem",
                fontWeight: 600,
                color: "rgba(255,255,255,.65)",
                textTransform: "uppercase",
                letterSpacing: ".08em",
              }}
            >
              {v.make} · {v.year}
            </div>
            <h2
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 800,
                fontSize: "1.8rem",
                color: "#fff",
              }}
            >
              {v.model}
            </h2>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "1.5rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.25rem",
              marginBottom: "1.5rem",
            }}
          >
            {/* Specs */}
            <div
              style={{
                background: "var(--off)",
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                border: "1px solid var(--border)",
              }}
            >
              <h4
                style={{
                  fontSize: ".72rem",
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  marginBottom: ".75rem",
                }}
              >
                Caractéristiques techniques
              </h4>
              {specRows.map(([key, val]) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: ".35rem 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: ".85rem",
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>{key}</span>
                  <span style={{ fontWeight: 500, color: "var(--navy)" }}>
                    {val}
                  </span>
                </div>
              ))}
            </div>

            {/* Pricing */}
            <div
              style={{
                background: "var(--off)",
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                border: "1px solid var(--border)",
              }}
            >
              <h4
                style={{
                  fontSize: ".72rem",
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  marginBottom: ".75rem",
                }}
              >
                Tarification
              </h4>
              <div
                style={{
                  fontFamily: "Syne, sans-serif",
                  fontWeight: 800,
                  fontSize: "1.9rem",
                  color: "var(--navy)",
                  marginBottom: ".25rem",
                }}
              >
                {v.prix.toLocaleString("fr-FR")} €
              </div>
              <div
                style={{
                  fontSize: ".78rem",
                  color: "var(--muted)",
                  marginBottom: "1rem",
                }}
              >
                Prix de vente HT · TVA récupérable en entreprise
              </div>
              {v.lld && v.mensualite ? (
                <div
                  style={{
                    background: "#E6F1FB",
                    border: "1px solid #85B7EB",
                    borderRadius: "8px",
                    padding: ".7rem 1rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: ".72rem",
                      fontWeight: 600,
                      color: "#185FA5",
                      textTransform: "uppercase",
                      letterSpacing: ".06em",
                      marginBottom: ".2rem",
                    }}
                  >
                    Offre LLD
                  </div>
                  <div
                    style={{
                      fontFamily: "Syne, sans-serif",
                      fontWeight: 700,
                      fontSize: "1.25rem",
                      color: "#0C447C",
                    }}
                  >
                    {v.mensualite} €{" "}
                    <span style={{ fontSize: ".8rem", fontWeight: 400 }}>
                      /mois HT
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: ".74rem",
                      color: "#378ADD",
                      marginTop: ".15rem",
                    }}
                  >
                    Mensualité de base · Options en sus
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--off)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: ".7rem 1rem",
                    fontSize: ".82rem",
                    color: "var(--muted)",
                  }}
                >
                  Ce véhicule est proposé à la vente uniquement — pas
                  d&apos;offre LLD disponible.
                </div>
              )}
            </div>
          </div>

          {/* LLD Options */}
          {v.lld && v.options.length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h4
                style={{
                  fontSize: ".72rem",
                  fontWeight: 700,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  marginBottom: ".75rem",
                }}
              >
                Options LLD disponibles
              </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: ".6rem",
                }}
              >
                {v.options.map((o) => (
                  <div
                    key={o.n}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "var(--off)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: ".55rem .9rem",
                      fontSize: ".82rem",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "var(--navy)" }}>
                      {o.n}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#185FA5",
                        fontSize: ".78rem",
                      }}
                    >
                      {o.p}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA buttons */}
          <div style={{ display: "flex", gap: ".75rem" }}>
            <button
              type="button"
              onClick={() => onDossier(v, v.lld ? "lld" : "achat")}
              style={{
                flex: 1,
                background: "var(--navy)",
                color: "#fff",
                border: "none",
                padding: ".85rem",
                borderRadius: "9px",
                fontSize: ".9rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "Syne, sans-serif",
              }}
            >
              {v.lld ? "Déposer un dossier LLD" : "Déposer un dossier Achat"}
            </button>
            {v.lld && (
              <button
                type="button"
                onClick={() => onDossier(v, "achat")}
                style={{
                  flex: 1,
                  background: "#fff",
                  color: "var(--navy)",
                  border: "1.5px solid var(--navy)",
                  padding: ".85rem",
                  borderRadius: "9px",
                  fontSize: ".9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Syne, sans-serif",
                }}
              >
                Déposer un dossier Achat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
