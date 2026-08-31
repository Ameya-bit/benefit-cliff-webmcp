import os

# The boot-time prewarm would compete with every test for the engine lock
# (~5 min of system builds); tests exercise the same code paths directly.
os.environ.setdefault("PEIRA_PREWARM", "0")
