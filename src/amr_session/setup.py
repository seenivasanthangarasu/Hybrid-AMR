from setuptools import find_packages, setup

package_name = 'amr_session'

setup(
    name=package_name,
    version='0.1.0',
    packages=find_packages(exclude=['test']),
    data_files=[
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='vasan',
    maintainer_email='seenivasanthangarasu@gmail.com',
    description='Authoritative AMR Power Cycle Session Manager and Publisher',
    license='Apache-2.0',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'session_publisher = amr_session.session_publisher:main',
        ],
    },
)
