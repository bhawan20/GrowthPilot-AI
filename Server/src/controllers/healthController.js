export function getHealth(_req, res) {
  res.json({
    success: true,
    message: "GrowthPilot AI backend is running",
  });
}
