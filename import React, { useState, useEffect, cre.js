import React, { useState, useEffect, createContext, useContext } from 'react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';

// You'll need to install lucide-react: npm install lucide-react
// Icons from Lucide React
import { ShoppingCart, Book, Loader2 } from 'lucide-react';

// --- Firebase and Data Persistence Setup ---
// In a real project, you would replace these with your actual Firebase config.
// For this example, we'll use placeholder values.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// This would typically be a unique ID for your application instance.
const appId = 'default-app-id'; 
// This would be a token provided upon user authentication.
const initialAuthToken = null; 

// Mock data for initial loading, before Firestore data is fetched
const mockBooks = [
  { id: '1', title: 'The Lord of the Rings', author: 'J.R.R. Tolkien', price: 29.99, imageUrl: 'https://placehold.co/400x600/1e293b/d4d4d8?text=Book+1', description: 'A classic high fantasy novel.' },
  { id: '2', title: 'The Hitchhiker\'s Guide to the Galaxy', author: 'Douglas Adams', price: 15.50, imageUrl: 'https://placehold.co/400x600/1e293b/d4d4d8?text=Book+2', description: 'A comedic science fiction series.' },
  { id: '3', title: 'Dune', author: 'Frank Herbert', price: 22.00, imageUrl: 'https://placehold.co/400x600/1e293b/d4d4d8?text=Book+3', description: 'An epic science fiction novel.' },
  { id: '4', title: '1984', author: 'George Orwell', price: 12.99, imageUrl: 'https://placehold.co/400x600/1e293b/d4d4d8?text=Book+4', description: 'A dystopian social science fiction novel.' },
  { id: '5', title: 'Pride and Prejudice', author: 'Jane Austen', price: 10.75, imageUrl: 'https://placehold.co/400x600/1e293b/d4d4d8?text=Book+5', description: 'A romantic novel of manners.' },
];

// Context for the shopping cart
const CartContext = createContext();

const App = () => {
  const [books, setBooks] = useState(mockBooks);
  const [cartItems, setCartItems] = useState([]);
  const [currentPage, setCurrentPage] = useState('home'); // State for navigation
  const [selectedBook, setSelectedBook] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);

  // Initialize Firebase and set up auth listener
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authService = getAuth(app);
      setDb(firestore);
      setAuth(authService);
      
      const unsubscribe = authService.onAuthStateChanged(async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authService, initialAuthToken);
            } else {
              await signInAnonymously(authService);
            }
          } catch (error) {
            console.error("Firebase sign-in failed:", error);
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setIsAuthReady(true); // Continue app loading even if firebase fails
    }
  }, []);

  // Fetch books from Firestore once authenticated
  useEffect(() => {
    if (isAuthReady && db) {
      const collectionPath = `/artifacts/${appId}/public/data/books`;
      const q = collection(db, collectionPath);
      
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const booksArray = [];
        querySnapshot.forEach((doc) => {
          booksArray.push({ id: doc.id, ...doc.data() });
        });
        
        if (booksArray.length > 0) {
            setBooks(booksArray);
        }
        setIsLoading(false);

        // If the collection is empty, populate it with mock data
        if (booksArray.length === 0) {
          console.log("No books found, populating with mock data...");
          mockBooks.forEach(book => {
            const docRef = doc(db, collectionPath, book.id);
            setDoc(docRef, book)
              .then(() => console.log(`Populated book: ${book.title}`))
              .catch(e => console.error("Error populating book:", e));
          });
        }
      }, (error) => {
        console.error("Failed to fetch books from Firestore:", error);
        setIsLoading(false);
      });

      return () => unsubscribe();
    }
  }, [isAuthReady, db]);

  // Load cart data from Firestore on auth and db readiness
  useEffect(() => {
    if (isAuthReady && db && userId) {
      const cartDocRef = doc(db, `/artifacts/${appId}/users/${userId}/cart`, 'myCart');
      const unsubscribe = onSnapshot(cartDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const cartData = docSnap.data();
          setCartItems(cartData.items || []);
        } else {
          setCartItems([]);
          setDoc(cartDocRef, { items: [] }).catch(e => console.error("Error creating cart document:", e));
        }
      }, (error) => {
        console.error("Failed to fetch cart from Firestore:", error);
      });

      return () => unsubscribe();
    }
  }, [isAuthReady, db, userId]);

  // Update cart in Firestore
  const updateCartInFirestore = async (newCartItems) => {
    if (!db || !userId) {
      console.error("Firestore or user not ready.");
      return;
    }
    const cartDocRef = doc(db, `/artifacts/${appId}/users/${userId}/cart`, 'myCart');
    try {
      // Using setDoc with merge: true is safer as it creates the doc if it doesn't exist
      await setDoc(cartDocRef, { items: newCartItems }, { merge: true });
    } catch (e) {
      console.error("Error updating cart in Firestore:", e);
    }
  };

  const handleAddToCart = (book) => {
    const existingCartItem = cartItems.find(item => item.id === book.id);
    let newCartItems;
    if (existingCartItem) {
      newCartItems = cartItems.map(item =>
        item.id === book.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      newCartItems = [...cartItems, { ...book, quantity: 1 }];
    }
    setCartItems(newCartItems);
    updateCartInFirestore(newCartItems);
  };

  const handleRemoveFromCart = (bookId) => {
    const newCartItems = cartItems.filter(item => item.id !== bookId);
    setCartItems(newCartItems);
    updateCartInFirestore(newCartItems);
  };
  
  const handleCheckout = () => {
    // This is a placeholder for a real checkout process.
    // In a real app, you would handle payment processing here.
    alert("Checkout functionality is not implemented yet!");
    setCartItems([]);
    updateCartInFirestore([]);
  };

  const navigateTo = (page, book = null) => {
    setCurrentPage(page);
    setSelectedBook(book);
  };

  const cartValue = {
    cartItems,
    handleAddToCart,
    handleRemoveFromCart,
  };

  // Conditionally render pages based on `currentPage` state
  const renderPage = () => {
    if (isLoading && !isAuthReady) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin text-gray-500" size={48} />
          <p className="ml-4 text-xl text-gray-700">Loading books...</p>
        </div>
      );
    }

    switch (currentPage) {
      case 'home':
        return <BookList books={books} navigateTo={navigateTo} />;
      case 'bookDetails':
        return <BookDetails book={selectedBook} navigateTo={navigateTo} />;
      case 'cart':
        return <CartPage cartItems={cartItems} navigateTo={navigateTo} handleCheckout={handleCheckout} />;
      default:
        return <BookList books={books} navigateTo={navigateTo} />;
    }
  };

  return (
    <CartContext.Provider value={cartValue}>
      <div className="min-h-screen bg-gray-50 text-slate-800">
        <Header navigateTo={navigateTo} cartItemCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)} userId={userId} />
        <main className="container mx-auto p-4 md:p-8">
          {renderPage()}
        </main>
        <Footer />
      </div>
    </CartContext.Provider>
  );
};

// --- Components ---

const Header = ({ navigateTo, cartItemCount, userId }) => {
  return (
    <header className="bg-slate-900 text-white shadow-md p-4 sticky top-0 z-50">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <Book className="h-8 w-8 text-indigo-400 mr-2" />
          <h1 className="text-2xl font-bold font-inter cursor-pointer" onClick={() => navigateTo('home')}>BookSphere</h1>
        </div>
        <nav className="flex items-center space-x-4">
          {userId && (
              <span className="text-sm hidden md:inline-block truncate max-w-[150px] md:max-w-none bg-slate-700 px-3 py-1 rounded-full">
                ID: {userId}
              </span>
          )}
          <button
            onClick={() => navigateTo('cart')}
            className="relative p-2 rounded-full hover:bg-slate-800 transition-colors"
          >
            <ShoppingCart className="h-6 w-6" />
            {cartItemCount > 0 && (
              <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                {cartItemCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
};

const BookList = ({ books, navigateTo }) => {
  return (
    <section className="py-12">
      <h2 className="text-4xl font-extrabold text-center mb-8 font-inter">Featured Books</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {books.map(book => (
          <BookCard key={book.id} book={book} navigateTo={navigateTo} />
        ))}
      </div>
    </section>
  );
};

const BookCard = ({ book, navigateTo }) => {
  const { handleAddToCart } = useContext(CartContext);
  return (
    <div className="bg-white rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300 overflow-hidden transform hover:-translate-y-2 flex flex-col h-full">
      <img
        src={book.imageUrl}
        alt={book.title}
        className="w-full h-72 object-cover object-center"
        onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/400x600/6b7280/f3f4f6?text=Image+Not+Found"; }}
      />
      <div className="p-6 flex-grow flex flex-col justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900 mb-1 font-inter">{book.title}</h3>
          <p className="text-sm text-gray-500 mb-4">{book.author}</p>
        </div>
        <div className="flex flex-col mt-4">
          <p className="text-2xl font-bold text-indigo-600 mb-4">${book.price.toFixed(2)}</p>
          <div className="flex space-x-2">
            <button
              onClick={() => navigateTo('bookDetails', book)}
              className="flex-1 bg-slate-900 text-white py-2 px-4 rounded-full font-semibold hover:bg-slate-700 transition-colors"
            >
              View Details
            </button>
            <button
              onClick={() => handleAddToCart(book)}
              className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-full font-semibold hover:bg-indigo-700 transition-colors"
            >
              Add to Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const BookDetails = ({ book, navigateTo }) => {
  const { handleAddToCart } = useContext(CartContext);
  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <h2 className="text-3xl font-bold text-red-600 mb-4">Book Not Found</h2>
        <button
          onClick={() => navigateTo('home')}
          className="bg-slate-900 text-white py-2 px-6 rounded-full font-semibold hover:bg-slate-700 transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <section className="py-12">
      <button
        onClick={() => navigateTo('home')}
        className="mb-8 px-4 py-2 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors font-semibold"
      >
        &larr; Back to Books
      </button>
      <div className="bg-white rounded-xl shadow-lg p-8 flex flex-col md:flex-row gap-8">
        <div className="md:w-1/3 flex justify-center">
          <img
            src={book.imageUrl}
            alt={book.title}
            className="w-full max-h-[600px] object-cover rounded-lg shadow-md"
            onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/400x600/6b7280/f3f4f6?text=Image+Not+Found"; }}
          />
        </div>
        <div className="md:w-2/3">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-2 font-inter">{book.title}</h2>
          <p className="text-xl text-gray-600 mb-4">by {book.author}</p>
          <p className="text-5xl font-bold text-indigo-600 mb-6">${book.price.toFixed(2)}</p>
          <h3 className="text-2xl font-bold text-slate-800 mb-2">Description</h3>
          <p className="text-gray-700 leading-relaxed mb-6">
            {book.description}
          </p>
          <button
            onClick={() => handleAddToCart(book)}
            className="w-full bg-indigo-600 text-white text-lg py-3 px-6 rounded-full font-semibold hover:bg-indigo-700 transition-colors"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </section>
  );
};

const CartPage = ({ cartItems, navigateTo, handleCheckout }) => {
  const { handleRemoveFromCart } = useContext(CartContext);
  const total = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);

  return (
    <section className="py-12">
      <h2 className="text-4xl font-extrabold text-center mb-8 font-inter">Your Shopping Cart</h2>
      {cartItems.length === 0 ? (
        <div className="text-center p-12 bg-white rounded-xl shadow-lg">
          <p className="text-2xl text-gray-500 mb-4">Your cart is empty.</p>
          <button
            onClick={() => navigateTo('home')}
            className="bg-indigo-600 text-white py-2 px-6 rounded-full font-semibold hover:bg-indigo-700 transition-colors"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-lg divide-y divide-gray-200">
            {cartItems.map(item => (
              <div key={item.id} className="p-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <img src={item.imageUrl} alt={item.title} className="w-16 h-24 object-cover rounded" 
                    onError={(e) => { e.target.onerror = null; e.target.src="https://placehold.co/400x600/6b7280/f3f4f6?text=Image+Not+Found"; }}
                  />
                  <div>
                    <h4 className="font-bold text-slate-900">{item.title}</h4>
                    <p className="text-gray-500 text-sm">by {item.author}</p>
                    <p className="text-indigo-600 font-semibold">${item.price.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="font-medium text-lg">Qty: {item.quantity}</span>
                  <button
                    onClick={() => handleRemoveFromCart(item.id)}
                    className="text-red-500 hover:text-red-700 transition-colors font-semibold"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col md:flex-row justify-between items-center">
            <h3 className="text-2xl font-bold text-slate-900 mb-4 md:mb-0">Total: ${total.toFixed(2)}</h3>
            <button
              onClick={handleCheckout}
              className="bg-green-600 text-white py-3 px-8 rounded-full font-semibold hover:bg-green-700 transition-colors text-lg"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

const Footer = () => {
  return (
    <footer className="bg-slate-900 text-white p-6 mt-12">
      <div className="container mx-auto text-center text-gray-400">
        <p>&copy; 2025 BookSphere. All rights reserved.</p>
        <p className="text-xs mt-2">Created with React, Firebase, and Tailwind CSS.</p>
      </div>
    </footer>
  );
};

export default App;
