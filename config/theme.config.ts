export const axiomTheme = {
  mode: "dark",
  companyName: "Axiom Process Solutions",
  colours: {
    axiomNavy: "#120462",
    axiomBlue: "#00c7f3",
    axiomAqua: "#00ece3",
    axiomGrey: "#565656",
    dark: {
      background: "#120462",
      backgroundDeep: "#050314",
      sidebar: "#120462",
      card: "rgba(18, 4, 98, 0.76)",
      panel: "rgba(21, 17, 56, 0.72)",
      border: "rgba(0, 199, 243, 0.22)",
      text: "#F8FAFC",
      mutedText: "#B8B8C8"
    },
    light: {
      background: "#F7FAFF",
      sidebar: "#FFFFFF",
      card: "#FFFFFF",
      panel: "#F8FBFF",
      border: "#D7E3F2",
      text: "#120462",
      mutedText: "#56627A"
    }
  },
  gradients: {
    darkShell: "linear-gradient(135deg, #120462 0%, #080321 58%, #050314 100%)",
    darkCard: "linear-gradient(135deg, rgba(18,4,98,0.86) 0%, rgba(5,3,20,0.92) 100%)",
    lightShell: "linear-gradient(135deg, #FFFFFF 0%, #F7FAFF 100%)",
    axiomAccent: "linear-gradient(135deg, #00c7f3 0%, #00ece3 100%)",
    subtleAccent: "linear-gradient(135deg, rgba(0,199,243,0.16) 0%, rgba(0,236,227,0.08) 100%)",
    topBorderAccent: "linear-gradient(90deg, #00c7f3 0%, #00ece3 100%)"
  },
  notes: [
    "Dark theme uses #120462 as the dominant background/shell colour.",
    "Primary filled buttons use #00c7f3 / #00ece3 accent gradient.",
    "Light theme remains white and clean, using #120462 for headings and #00c7f3 for key actions."
  ]
} as const;
