#!/usr/bin/env python3
"""
Test script for the AI-powered Image Selector Agent.
Tests context-based image selection for Super Wings characters.
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.agents.image_selector import (
    get_image_selector,
    reset_image_selector,
    ImageSelectorAgent,
    ImageCategory,
    EmotionType,
    ActionType,
)

# Reset singleton to ensure fresh catalog
reset_image_selector()


def print_section(title: str):
    """Print a section header."""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_catalog_building():
    """Test that the image catalog is built correctly."""
    print_section("Image Catalog Building")

    selector = get_image_selector()
    stats = selector.get_catalog_stats()

    print(f"Total characters: {len(stats)}")
    for char_id, folders in stats.items():
        print(f"\n{char_id}:")
        for folder, count in folders.items():
            print(f"  - {folder}: {count} images")

    return len(stats) > 0


def test_emotion_selection():
    """Test image selection based on emotions."""
    print_section("Emotion-Based Selection")

    selector = get_image_selector()

    emotions = ["happy", "sad", "angry", "excited", "worried", "confident"]

    for emotion in emotions:
        result = selector.select_image(
            character_id="jett",
            emotion=emotion
        )
        print(f"Emotion '{emotion}':")
        print(f"  -> {result.filename}")
        print(f"     Category: {result.category}, Confidence: {result.confidence:.2f}")
        if result.alternatives:
            print(f"     Alternatives: {', '.join([a.split('/')[-1] for a in result.alternatives[:2]])}")

    return True


def test_action_selection():
    """Test image selection based on actions."""
    print_section("Action-Based Selection")

    selector = get_image_selector()

    actions = ["flying", "building", "rescuing", "celebrating", "communicating"]

    for action in actions:
        result = selector.select_image(
            character_id="donnie",  # Construction expert
            action=action
        )
        print(f"Action '{action}':")
        print(f"  -> {result.filename}")
        print(f"     Category: {result.category}, Confidence: {result.confidence:.2f}")

    return True


def test_mission_selection():
    """Test image selection based on mission types."""
    print_section("Mission-Type Selection")

    selector = get_image_selector()

    missions = [
        ("jett", "delivery"),
        ("donnie", "construction"),
        ("bello", "animal_care"),
        ("paul", "police"),
        ("flip", "sports"),
    ]

    for char_id, mission_type in missions:
        result = selector.select_image(
            character_id=char_id,
            mission_type=mission_type
        )
        print(f"{char_id.capitalize()} on {mission_type} mission:")
        print(f"  -> {result.filename}")
        print(f"     Confidence: {result.confidence:.2f}")

    return True


def test_context_selection():
    """Test image selection based on free-text context."""
    print_section("Context-Based Selection")

    selector = get_image_selector()

    contexts = [
        ("jett", "Jett is excited about delivering a birthday present to Tokyo!"),
        ("donnie", "Donnie is building a playground for the kids in Brazil"),
        ("bello", "Bello is helping rescue lost puppies in the forest"),
        ("paul", "Paul is patrolling the streets to keep everyone safe"),
        ("jerome", "Jerome is celebrating after a successful performance"),
    ]

    for char_id, context in contexts:
        result = selector.select_image(
            character_id=char_id,
            context=context
        )
        print(f"{char_id.capitalize()}:")
        print(f"  Context: \"{context[:50]}...\"")
        print(f"  -> {result.filename}")
        print(f"     Category: {result.category}, Confidence: {result.confidence:.2f}")

    return True


def test_dialogue_selection():
    """Test image selection for dialogue scenarios."""
    print_section("Dialogue Selection")

    selector = get_image_selector()

    dialogue_types = ["greeting", "farewell", "transformation", "success", "failure"]

    for dtype in dialogue_types:
        result = selector.select_for_dialogue(
            character_id="jett",
            dialogue_type=dtype,
            emotion="neutral"
        )
        print(f"Dialogue '{dtype}':")
        print(f"  -> {result.filename}")
        print(f"     Category: {result.category}")

    return True


def test_mission_phase_selection():
    """Test image selection for mission phases."""
    print_section("Mission Phase Selection")

    selector = get_image_selector()

    phases = ["start", "active", "end"]

    for phase in phases:
        result = selector.select_for_mission(
            character_id="donnie",
            mission_type="construction",
            phase=phase
        )
        print(f"Phase '{phase}':")
        print(f"  -> {result.filename}")
        print(f"     Category: {result.category}")

    return True


def test_transformation_sequence():
    """Test transformation sequence retrieval."""
    print_section("Transformation Sequence")

    selector = get_image_selector()

    # Test for multiple characters
    for char_id in ["jett", "donnie", "bello"]:
        frames = selector.select_transformation_sequence(
            character_id=char_id,
            stage_count=5
        )
        print(f"{char_id.capitalize()} transformation sequence:")
        for i, frame in enumerate(frames[:3]):
            print(f"  Stage {i+1}: {frame.split('/')[-1]}")
        if len(frames) > 3:
            print(f"  ... ({len(frames)} total frames)")

    return True


def test_variant_preference():
    """Test variant preference in selection."""
    print_section("Variant Preference")

    selector = get_image_selector()

    # Test selecting specific variants
    for variant in [1, 2, 3]:
        result = selector.select_image(
            character_id="jett",
            emotion="happy",
            prefer_variant=variant
        )
        print(f"Prefer variant {variant}:")
        print(f"  -> {result.filename}")

    return True


def test_fallback_behavior():
    """Test fallback behavior for unknown inputs."""
    print_section("Fallback Behavior")

    selector = get_image_selector()

    # Test with unknown character
    result = selector.select_image(
        character_id="unknown_character",
        emotion="happy"
    )
    print(f"Unknown character:")
    print(f"  -> {result.filename}")
    print(f"     Category: {result.category}, Confidence: {result.confidence:.2f}")

    # Test with no matching keywords
    result = selector.select_image(
        character_id="jett",
        context="Something completely unrelated"
    )
    print(f"\nNo keyword match:")
    print(f"  -> {result.filename}")
    print(f"     Category: {result.category}, Confidence: {result.confidence:.2f}")

    return True


def main():
    """Run all tests."""
    print("\n" + "="*60)
    print("  Super Wings AI Image Selector Test Suite")
    print("="*60)

    tests = [
        ("Catalog Building", test_catalog_building),
        ("Emotion Selection", test_emotion_selection),
        ("Action Selection", test_action_selection),
        ("Mission Selection", test_mission_selection),
        ("Context Selection", test_context_selection),
        ("Dialogue Selection", test_dialogue_selection),
        ("Mission Phase Selection", test_mission_phase_selection),
        ("Transformation Sequence", test_transformation_sequence),
        ("Variant Preference", test_variant_preference),
        ("Fallback Behavior", test_fallback_behavior),
    ]

    results = []
    for name, test_func in tests:
        try:
            success = test_func()
            results.append((name, success, None))
        except Exception as e:
            results.append((name, False, str(e)))
            print(f"ERROR: {e}")

    # Summary
    print_section("Test Summary")

    passed = sum(1 for _, success, _ in results if success)
    total = len(results)

    for name, success, error in results:
        status = "PASS" if success else "FAIL"
        print(f"[{status}] {name}")
        if error:
            print(f"       Error: {error}")

    print(f"\nTotal: {passed}/{total} tests passed")

    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
