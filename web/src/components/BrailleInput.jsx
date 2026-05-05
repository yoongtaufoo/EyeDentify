import React, { useState } from 'react';

export default function BrailleInput({ onCharSubmit, onDeleteChar }) {
  const [dots, setDots] = useState([]);

  const handleDot = (n) => {
    speak(`Dot ${n}`);
    setDots((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n]
    );
  };

  const handleSubmit = () => {
    if (dots.length > 0) {
      const char = dots.sort().join('');
      onCharSubmit(char);
      setDots([]);
      speak('Character entered');
    }
  };

  return (
    <div style={styles.container}>
      <p style={styles.gridLabel}>Braille Dot Grid (tap dots to compose)</p>

      <div style={styles.grid}>
        {[1, 4, 2, 5, 3, 6].map((n) => (
          <button
            key={n}
            style={[styles.dot, dots.includes(n) && styles.dotActive]}
            onClick={() => handleDot(n)}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {n}
          </button>
        ))}
      </div>

      <div style={styles.actionsRow}>
        <button
          style={[styles.submitBtn, styles.spaceBtn]}
          onClick={() => { onCharSubmit(' '); speak('Space'); }}
        >
          Space
        </button>
        <button
          style={[styles.submitBtn, styles.deleteBtn]}
          onClick={() => { if (onDeleteChar) { onDeleteChar(); speak('Deleted'); } }}
        >
          ⌫ Delete
        </button>
        <button style={[styles.submitBtn, styles.confirmBtn]} onClick={handleSubmit}>
          ✓ Confirm Char
        </button>
      </div>
    </div>
  );
}

function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

const styles = {
  container: {
    width: '100%',
    padding: 10,
    backgroundColor: '#0A0A0F',
  },
  gridLabel: {
    color: '#8E8EA0',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '2.5%',
    marginBottom: 12,
  },
  dot: {
    width: '30%',
    aspectRatio: '1',
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    border: '2px solid #6C63FF',
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s',
    fontFamily: 'inherit',
  },
  dotActive: {
    backgroundColor: '#6C63FF',
    borderColor: '#FFF',
  },
  actionsRow: {
    display: 'flex',
    gap: 8,
  },
  submitBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: 12,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  spaceBtn: {
    backgroundColor: '#1976D2',
    color: '#FFF',
  },
  deleteBtn: {
    backgroundColor: '#D32F2F',
    color: '#FFF',
  },
  confirmBtn: {
    backgroundColor: '#4CAF50',
    color: '#FFF',
  },
};
