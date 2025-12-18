import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

class RVCService:
    def __init__(self, models_dir: str = "assets/models/rvc"):
        self.models_dir = Path(models_dir)
        self.output_dir = Path("assets/audio/generated")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def is_model_available(self, character_id: str) -> bool:
        """Check if RVC model exists for character."""
        model_path = self.models_dir / f"{character_id}.pth"
        return model_path.exists()

    async def convert_voice(self, input_audio_path: str, character_id: str) -> str:
        """
        Convert input audio to character voice using RVC.
        
        Args:
            input_audio_path: Path to TTS generated wav file
            character_id: Target character
            
        Returns:
            Path to converted output file
        """
        if not self.is_model_available(character_id):
            logger.warning(f"No RVC model for {character_id}, returning original.")
            return input_audio_path

        model_path = self.models_dir / f"{character_id}.pth"
        index_path = self.models_dir / f"{character_id}.index"
        output_path = self.output_dir / f"{character_id}_{os.path.basename(input_audio_path)}"

        logger.info(f"Starting RVC conversion for {character_id}...")
        
        # TODO: Call RVC Inference here
        # This usually involves loading the model via torch and running the pipeline.
        # Alternatively, call an external CLI if RVC is installed as a tool.
        
        # Example pseudo-code for CLI integration:
        # cmd = [
        #     "python", "rvc_inference.py",
        #     "--model", str(model_path),
        #     "--input", input_audio_path,
        #     "--output", str(output_path)
        # ]
        # subprocess.run(cmd, check=True)
        
        return str(output_path)
