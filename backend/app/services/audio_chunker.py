from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


def split_audio_to_chunks(
    content: bytes,
    filename: str,
    chunk_duration_s: int = 600,
) -> list[tuple[int, bytes, str]]:
    """Split audio into timed chunks via ffmpeg, re-encoded as mono mp3 @ 64 kbps.

    Returns list of (index, chunk_bytes, chunk_filename) sorted by index.
    At 64 kbps, a 10-minute chunk ≈ 4.6 MB — safely under Whisper's 25 MB cap.
    """
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found — cannot split audio")

    in_ext = Path(filename).suffix.lower().lstrip(".") or "mp3"

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        in_path = tmp / f"input.{in_ext}"
        in_path.write_bytes(content)

        out_pattern = str(tmp / "chunk_%04d.mp3")

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(in_path),
                "-f", "segment",
                "-segment_time", str(chunk_duration_s),
                "-ar", "16000",
                "-ac", "1",
                "-b:a", "64k",
                "-vn",
                out_pattern,
            ],
            capture_output=True,
            timeout=300,
        )

        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace")[-600:]
            raise RuntimeError(f"ffmpeg failed: {stderr}")

        chunks: list[tuple[int, bytes, str]] = []
        for chunk_path in sorted(tmp.glob("chunk_*.mp3")):
            idx = int(chunk_path.stem.split("_")[1])
            chunks.append((idx, chunk_path.read_bytes(), chunk_path.name))

        if not chunks:
            raise RuntimeError("No audio chunks produced — the file may be empty or invalid")

        return sorted(chunks, key=lambda x: x[0])
