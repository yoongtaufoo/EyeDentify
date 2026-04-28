// import React, { useState } from 'react';
// import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
// import * as Haptics from 'expo-haptics';
// import * as Speech from 'expo-speech';

// export default function BrailleInput({ onCharSubmit }) {
//   const [activeDots, setActiveDots] = useState([]);

//   const handleDotPress = (dot) => {
//     // 1-6 Unique Vibration Patterns
//     const patterns = [
//       Haptics.ImpactFeedbackStyle.Light,  // Dot 1
//       Haptics.ImpactFeedbackStyle.Medium, // Dot 2
//       Haptics.ImpactFeedbackStyle.Heavy,  // Dot 3
//       Haptics.ImpactFeedbackStyle.Light,  // Dot 4
//       Haptics.ImpactFeedbackStyle.Medium, // Dot 5
//       Haptics.ImpactFeedbackStyle.Heavy,  // Dot 6
//     ];

//     Haptics.impactAsync(patterns[dot - 1]);
//     if (dot > 3) Haptics.selectionAsync(); // Extra tactile click for right side
    
//     Speech.speak(`Dot ${dot}`);
    
//     // Toggle dot state
//     setActiveDots(prev => 
//       prev.includes(dot) ? prev.filter(d => d !== dot) : [...prev, dot]
//     );
//   };

//   const handleSubmit = () => {
//     if (activeDots.length === 0) return;
//     onCharSubmit(activeDots.sort().join(''));
//     setActiveDots([]);
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Character entered");
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.grid}>
//         {[1, 4, 2, 5, 3, 6].map((dot) => (
//           <TouchableOpacity 
//             key={dot} 
//             style={[styles.dot, activeDots.includes(dot) && styles.dotActive]} 
//             onPress={() => handleDotPress(dot)}
//           >
//             <Text style={styles.dotText}>{dot}</Text>
//           </TouchableOpacity>
//         ))}
//       </View>
//       <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
//         <Text style={styles.submitText}>SUBMIT DOTS</Text>
//       </TouchableOpacity>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { height: 450, width: '100%', padding: 10 },
//   grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
//   dot: { 
//     width: '45%', 
//     height: '28%', 
//     margin: '2.5%', 
//     backgroundColor: '#1A1A24', 
//     borderRadius: 20, 
//     justifyContent: 'center', 
//     alignItems: 'center', 
//     borderWidth: 2, 
//     borderColor: '#6C63FF' 
//   },
//   dotActive: { backgroundColor: '#6C63FF', borderColor: '#FFF' },
//   dotText: { color: '#FFF', fontSize: 28, fontWeight: 'bold' },
//   submitBtn: { 
//     backgroundColor: '#4CAF50', 
//     height: 60, 
//     borderRadius: 15, 
//     justifyContent: 'center', 
//     alignItems: 'center',
//     marginTop: 10
//   },
//   submitText: { color: '#FFF', fontWeight: 'bold', fontSize: 18 }
// });

// #####################################################################################

// import React, { useState } from 'react';
// import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
// import * as Haptics from 'expo-haptics';
// import * as Speech from 'expo-speech';

// export default function BrailleInput({ onCharSubmit }) {
//   const [dots, setDots] = useState([]);

//   const handleDot = (n) => {
//     const feedback = [
//       Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy,
//       Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy
//     ];
//     Haptics.impactAsync(feedback[n-1]);
//     if (n > 3) Haptics.selectionAsync(); // Subtle variation for right-side dots
//     Speech.speak(`Dot ${n}`);
//     setDots(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]);
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.grid}>
//         {[1, 4, 2, 5, 3, 6].map(n => (
//           <TouchableOpacity key={n} style={[styles.dot, dots.includes(n) && styles.active]} onPress={() => handleDot(n)}>
//             <Text style={styles.dotTxt}>{n}</Text>
//           </TouchableOpacity>
//         ))}
//       </View>
//       <TouchableOpacity style={styles.submit} onPress={() => { onCharSubmit(dots.join('')); setDots([]); }}>
//         <Text style={styles.subTxt}>SUBMIT CHAR</Text>
//       </TouchableOpacity>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { height: 400, width: '100%' },
//   grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
//   dot: { width: '45%', height: '30%', margin: '2.5%', backgroundColor: '#1A1A24', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#6C63FF' },
//   active: { backgroundColor: '#6C63FF' },
//   dotTxt: { color: '#FFF', fontSize: 24 },
//   submit: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center' },
//   subTxt: { color: '#FFF', fontWeight: 'bold' }
// });

// #############################################

// import React, { useState } from 'react';
// import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
// import * as Haptics from 'expo-haptics';
// import * as Speech from 'expo-speech';

// export default function BrailleInput({ onCharSubmit }) {
//   const [dots, setDots] = useState([]);

//   const handleDot = (n) => {
//     const intensity = [
//       Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy,
//       Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy
//     ];
//     Haptics.impactAsync(intensity[n-1]);
//     Speech.speak(`Dot ${n}`);
//     setDots(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]);
//   };

//   return (
//     <View style={styles.container}>
//       <View style={styles.grid}>
//         {[1, 4, 2, 5, 3, 6].map(n => (
//           <TouchableOpacity key={n} style={[styles.dot, dots.includes(n) && styles.active]} onPress={() => handleDot(n)}>
//             <Text style={styles.dotTxt}>{n}</Text>
//           </TouchableOpacity>
//         ))}
//       </View>
//       <TouchableOpacity onPress={() => { onCharSubmit(dots.join('')); setDots([]); }} style={styles.sub}><Text>SUBMIT</Text></TouchableOpacity>
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: { height: 350, width: '100%' },
//   grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
//   dot: { width: '45%', height: '30%', margin: '2.5%', backgroundColor: '#1A1A24', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#6C63FF' },
//   active: { backgroundColor: '#6C63FF' },
//   dotTxt: { color: '#FFF' },
//   sub: { backgroundColor: '#4CAF50', padding: 15, alignItems: 'center' }
// });

// ##################

// import React, { useState, useEffect } from 'react';
// import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
// import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
// import * as Haptics from 'expo-haptics';
// import * as Speech from 'expo-speech';
// import { Audio } from 'expo-av';

// export default function BrailleInput({ onCharSubmit, onDeleteChar }) {
//   const [dots, setDots] = useState([]);
//   const [sound, setSound] = useState();

//   // Load the beep sound
//   async function playBeep() {
//     const { sound } = await Audio.Sound.createAsync(
//        require('../../assets/beep.mp3') // Make sure to put a small beep.mp3 in assets!
//     );
//     setSound(sound);
//     await sound.playAsync();
//   }

//   useEffect(() => {
//     return sound ? () => { sound.unloadAsync(); } : undefined;
//   }, [sound]);

//   const handleDot = (n) => {
//     playBeep(); // Audio feedback
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
//     Speech.speak(`Dot ${n}`);
//     setDots(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]);
//   };

//   // --- GESTURES FOR BRAILLE GRID ---
//   const swipeLeft = Gesture.Fling()
//     .direction(Directions.LEFT)
//     .onEnd(() => {
//       onDeleteChar(); // Call the parent to remove the last letter
//       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
//       Speech.speak("Deleted");
//     }).runOnJS(true);

//   const swipeRight = Gesture.Fling()
//     .direction(Directions.RIGHT)
//     .onEnd(() => {
//       Speech.speak("Space");
//       onCharSubmit(" "); // Submit a space
//     }).runOnJS(true);

//   const composed = Gesture.Simultaneous(swipeLeft, swipeRight);

//   return (
//     <GestureDetector gesture={composed}>
//       <View style={styles.container}>
//         <View style={styles.grid}>
//           {[1, 4, 2, 5, 3, 6].map(n => (
//             <TouchableOpacity 
//               key={n} 
//               style={[styles.dot, dots.includes(n) && styles.active]} 
//               onPress={() => handleDot(n)}
//             >
//               <Text style={styles.dotTxt}>{n}</Text>
//             </TouchableOpacity>
//           ))}
//         </View>
//         <TouchableOpacity 
//           style={styles.submit} 
//           onPress={() => { onCharSubmit(dots.sort().join('')); setDots([]); }}
//         >
//           <Text style={styles.subTxt}>CONFIRM CHARACTER</Text>
//         </TouchableOpacity>
//       </View>
//     </GestureDetector>
//   );
// }

// const styles = StyleSheet.create({
//   container: { height: 420, width: '100%', backgroundColor: '#0A0A0F' },
//   grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
//   dot: { width: '45%', height: '30%', margin: '2.5%', backgroundColor: '#1A1A24', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#6C63FF' },
//   active: { backgroundColor: '#6C63FF' },
//   dotTxt: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
//   submit: { backgroundColor: '#4CAF50', padding: 20, borderRadius: 15, alignItems: 'center', margin: 10 },
//   subTxt: { color: '#FFF', fontWeight: 'bold' }
// });

// ############################

import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

export default function BrailleInput({ onCharSubmit, onDeleteChar }) {
  const [dots, setDots] = useState([]);

  const handleDot = (n) => {
    const intensity = [
      Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy,
      Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy
    ];
    // Tactile feedback only - no beep
    Haptics.impactAsync(intensity[n - 1]);
    Speech.speak(`Dot ${n}`);
    setDots(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]);
  };

  // Swiping gestures for the Braille Grid
  const swipeLeft = Gesture.Fling().direction(Directions.LEFT).onEnd(() => {
    onDeleteChar();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Speech.speak("Deleted");
  }).runOnJS(true);

  const swipeRight = Gesture.Fling().direction(Directions.RIGHT).onEnd(() => {
    onCharSubmit(" "); 
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.speak("Space");
  }).runOnJS(true);

  const composed = Gesture.Simultaneous(swipeLeft, swipeRight);

  return (
    <GestureDetector gesture={composed}>
      <View style={styles.container}>
        <View style={styles.grid}>
          {[1, 4, 2, 5, 3, 6].map(n => (
            <TouchableOpacity 
              key={n} 
              style={[styles.dot, dots.includes(n) && styles.active]} 
              onPress={() => handleDot(n)}
            >
              <Text style={styles.dotTxt}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity 
          style={styles.submit} 
          onPress={() => { onCharSubmit(dots.sort().join('')); setDots([]); }}
        >
          <Text style={styles.subTxt}>CONFIRM CHAR</Text>
        </TouchableOpacity>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { height: 400, width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', flex: 1 },
  dot: { width: '45%', height: '30%', margin: '2.5%', backgroundColor: '#1A1A24', borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#6C63FF' },
  active: { backgroundColor: '#6C63FF' },
  dotTxt: { color: '#FFF', fontSize: 24, fontWeight: 'bold' },
  submit: { backgroundColor: '#4CAF50', padding: 15, borderRadius: 10, alignItems: 'center', margin: 10 },
  subTxt: { color: '#FFF', fontWeight: 'bold' }
});