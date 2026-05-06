"use client";

import Image from "next/image";
import { Vehicle } from "@/types";

interface VehicleCardProps {
  vehicle: Vehicle;
  onClick: (v: Vehicle) => void;
}

export default function VehicleCard({
  vehicle: v,
  onClick,
}: Readonly<VehicleCardProps>) {
  return (
    <button
      type="button"
      className="vehicle-card"
      aria-label={`Ouvrir la fiche ${v.make} ${v.model}, ${v.year}`}
      onClick={() => onClick(v)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        font: "inherit",
        margin: 0,
        padding: 0,
        background: "var(--white)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
        cursor: "pointer",
        border: "1px solid var(--border)",
        transition: "transform .2s, box-shadow .2s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = "translateY(-3px)";
        el.style.boxShadow = "0 8px 28px rgba(13,27,75,.14)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "var(--shadow)";
      }}
    >
      {/* Image */}
      <div
        style={{
          position: "relative",
          height: "175px",
          overflow: "hidden",
          background: "#e8eaf0",
        }}
      >
        <div
          className="card-img-inner"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            transition: "transform .3s",
          }}
        >
          <Image
            src={v.img}
            alt={`${v.make} ${v.model}`}
            fill
            style={{ objectFit: "cover" }}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        </div>

        {/* Badge type */}
        <div
          style={{
            position: "absolute",
            top: ".6rem",
            left: ".6rem",
            padding: ".3rem .7rem",
            borderRadius: "5px",
            fontSize: ".72rem",
            fontWeight: 700,
            letterSpacing: ".04em",
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
              flexShrink: 0,
              background: v.lld ? "#185FA5" : "#639922",
            }}
          />
          {v.lld ? "LLD disponible" : "Achat uniquement"}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "1rem" }}>
        <div
          style={{
            fontSize: ".72rem",
            fontWeight: 600,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: ".07em",
            marginBottom: ".15rem",
          }}
        >
          {v.make}
        </div>
        <div
          style={{
            fontFamily: "Syne, sans-serif",
            fontWeight: 700,
            fontSize: "1.05rem",
            color: "var(--navy)",
            marginBottom: ".55rem",
          }}
        >
          {v.model} {v.year}
        </div>

        {/* Specs chips */}
        <div
          style={{
            display: "flex",
            gap: ".5rem",
            flexWrap: "wrap",
            marginBottom: ".8rem",
          }}
        >
          {[v.km.toLocaleString("fr-FR") + " km", v.moteur, v.specs.boite].map(
            (s) => (
              <span
                key={s}
                style={{
                  fontSize: ".74rem",
                  background: "var(--off)",
                  color: "var(--muted)",
                  padding: ".22rem .6rem",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                {s}
              </span>
            ),
          )}
        </div>

        {/* Price row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingTop: ".7rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: ".7rem",
                color: "var(--muted)",
                marginBottom: ".1rem",
              }}
            >
              Prix de vente
            </div>
            <div
              style={{
                fontFamily: "Syne, sans-serif",
                fontWeight: 700,
                fontSize: "1.1rem",
                color: "var(--navy)",
              }}
            >
              {v.prix.toLocaleString("fr-FR")} €
            </div>
            {v.lld && v.mensualite && (
              <div
                style={{
                  fontSize: ".75rem",
                  color: "var(--muted)",
                  marginTop: ".1rem",
                }}
              >
                LLD dès{" "}
                <strong style={{ color: "#185FA5", fontWeight: 600 }}>
                  {v.mensualite} €
                </strong>
                {"/mois"}
              </div>
            )}
          </div>
          <span
            style={{
              display: "inline-block",
              background: "var(--navy)",
              color: "var(--white)",
              padding: ".45rem .9rem",
              borderRadius: "6px",
              fontSize: ".78rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "DM Sans, sans-serif",
              flexShrink: 0,
            }}
          >
            Voir la fiche
          </span>
        </div>
      </div>
    </button>
  );
}
