"""The seven steps of the agent loop.

Each module exposes one public function, takes data in and returns data out.
Steps never call each other — handler.py owns the sequencing. A step that imports
another step is a design error.
"""
