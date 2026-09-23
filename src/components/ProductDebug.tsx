import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';

export const ProductDebug = () => {
  const [debug, setDebug] = useState<any>(null);

  useEffect(() => {
    const testFirestore = async () => {
      try {
        console.log('=== PRODUCT DEBUG START ===');
        
        // Test 1: Try to read all products (no filters)
        const allProductsSnapshot = await getDocs(collection(db, 'products'));
        console.log('Total products in database:', allProductsSnapshot.size);
        
        const allProducts = allProductsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('All products:', allProducts);
        
        // Test 2: Check each product's structure
        allProducts.forEach((product: any, index) => {
          console.log(`Product ${index + 1}:`, {
            id: product.id,
            name: product.name,
            category: product.category,
            subcategory: product.subcategory,
            'flags.isActive': product.flags?.isActive,
            flags: product.flags,
          });
        });
        
        // Test 3: Filter by isActive
        const activeProducts = allProducts.filter((p: any) => p.flags?.isActive === true);
        console.log('Active products:', activeProducts.length);
        
        // Test 4: Filter by subcategory "Necklaces"
        const necklaces = activeProducts.filter((p: any) => p.subcategory === 'Necklaces');
        console.log('Necklaces (active):', necklaces.length);
        console.log('Necklace products:', necklaces);
        
        setDebug({
          total: allProductsSnapshot.size,
          allProducts,
          activeProducts: activeProducts.length,
          necklaces: necklaces.length,
          necklaceList: necklaces,
        });
        
        console.log('=== PRODUCT DEBUG END ===');
      } catch (error) {
        console.error('Debug error:', error);
        setDebug({ error: error.message });
      }
    };

    testFirestore();
  }, []);

  if (!debug) return <div className="p-4 bg-gray-100 dark:bg-zinc-800">Loading debug info...</div>;

  if (debug.error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 rounded">
        <h3 className="font-bold text-red-700">Error:</h3>
        <pre className="text-sm">{debug.error}</pre>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-300 rounded m-4">
      <h3 className="font-bold text-lg mb-2">🔍 Product Debug Info</h3>
      <div className="space-y-2 text-sm">
        <p><strong>Total products in DB:</strong> {debug.total}</p>
        <p><strong>Active products:</strong> {debug.activeProducts}</p>
        <p><strong>Active Necklaces:</strong> {debug.necklaces}</p>
        
        {debug.necklaceList && debug.necklaceList.length > 0 && (
          <div className="mt-4">
            <strong>Necklace Products:</strong>
            <ul className="list-disc pl-5 mt-2">
              {debug.necklaceList.map((product: any) => (
                <li key={product.id}>
                  {product.name} - Category: {product.category}, Subcategory: {product.subcategory}, Active: {product.flags?.isActive ? '✅' : '❌'}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <details className="mt-4">
          <summary className="cursor-pointer font-semibold">View all products (raw data)</summary>
          <pre className="mt-2 p-2 bg-gray-800 text-green-400 text-xs overflow-auto max-h-96">
            {JSON.stringify(debug.allProducts, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
};
