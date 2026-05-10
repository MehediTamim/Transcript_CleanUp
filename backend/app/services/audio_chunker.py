from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

import sentry_sdk

logger = logging.getLogger(__name__)


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
        err = RuntimeError("ffmpeg not found — cannot split audio")
        logger.error("ffmpeg binary not found on PATH", extra={"filename": filename})
        sentry_sdk.capture_exception(err)
        raise err

    in_ext = Path(filename).suffix.lower().lstrip(".") or "mp3"
    size_mb = round(len(content) / (1024 * 1024), 2)
    logger.info(
        "audio_chunker: splitting started",
        extra={"filename": filename, "size_mb": size_mb, "chunk_duration_s": chunk_duration_s},
    )
    sentry_sdk.add_breadcrumb(
        category="audio_chunker",
        message=f"Splitting {filename} ({size_mb} MB) into {chunk_duration_s}s chunks",
        level="info",
    )

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
            err = RuntimeError(f"ffmpeg failed: {stderr}")
            logger.error(
                "audio_chunker: ffmpeg exited with non-zero code",
                extra={"filename": filename, "returncode": result.returncode, "stderr_tail": stderr},
            )
            sentry_sdk.capture_exception(err)
            raise err

        chunks: list[tuple[int, bytes, str]] = []
        for chunk_path in sorted(tmp.glob("chunk_*.mp3")):
            idx = int(chunk_path.stem.split("_")[1])
            chunks.append((idx, chunk_path.read_bytes(), chunk_path.name))

        if not chunks:
            err = RuntimeError("No audio chunks produced — the file may be empty or invalid")
            logger.error(
                "audio_chunker: ffmpeg produced no output chunks",
                extra={"filename": filename, "size_mb": size_mb},
            )
            sentry_sdk.capture_exception(err)
            raise err

        total = len(chunks)
        logger.info(
            "audio_chunker: splitting complete",
            extra={"filename": filename, "total_chunks": total},
        )
        sentry_sdk.add_breadcrumb(
            category="audio_chunker",
            message=f"Split complete — {total} chunks produced",
            level="info",
        )
        return sorted(chunks, key=lambda x: x[0])
